import { useEffect, useRef } from "react"
import { defaultPrefs, syncFromBackend, useDB } from "./store"
import type { User } from "./types"

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const TOKEN_KEY = 'hadirku:token'

async function postNotice(type: string, title: string, text: string) {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return
  try {
    await fetch(`${API_URL}/api/notices/self`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ type, title, text }),
    })
    await syncFromBackend()
  } catch { /* best-effort, no crash */ }
}

const inQuiet = (from: string, to: string, now = new Date()) => {
  const m = now.getHours() * 60 + now.getMinutes()
  const [fh, fm] = from.split(":").map(Number)
  const [th, tm] = to.split(":").map(Number)
  const a = fh * 60 + fm
  const b = th * 60 + tm
  return a <= b ? m >= a && m < b : m >= a || m < b
}

const REMIND_MIN = 10

export function useScheduleReminder(user: User | undefined) {
  const ref = useRef(user)
  ref.current = user
  useEffect(() => {
    const check = () => {
      const u = ref.current
      if (!u || u.role !== "teacher" || !u.schedule) return
      const now = new Date()
      const m = now.getHours() * 60 + now.getMinutes()
      for (const it of u.schedule) {
        if (it.day !== now.getDay()) continue
        const [h, mm] = it.start.split(":").map(Number)
        const diff = h * 60 + mm - m
        if (diff < 0 || diff > REMIND_MIN) continue
        const key = `hadirku:remind:${it.id}:${now.toDateString()}`
        if (localStorage.getItem(key)) continue
        localStorage.setItem(key, "1")
        postNotice("info", `Pengingat mengajar: ${it.subject}`, `Kelas ${it.className} dimulai pukul ${it.start.replace(":", ".")}. Buka sesi QR saat masuk kelas.`)
      }
    }
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [])
}

export function useNotifier(user: User | undefined) {
  const db = useDB()
  const seen = useRef<{ uid?: string; ids: Set<string> }>({ ids: new Set() })

  useEffect(() => {
    if (!user) {
      seen.current = { ids: new Set() }
      return
    }
    const mine = db.notices.filter((n) => n.userId === user.id)
    if (seen.current.uid !== user.id) {
      seen.current = { uid: user.id, ids: new Set(mine.map((n) => n.id)) }
      return
    }
    const prefs = { ...defaultPrefs, ...user.prefs }
    for (const n of mine) {
      if (seen.current.ids.has(n.id)) continue
      seen.current.ids.add(n.id)
      if (!prefs.push || typeof Notification === "undefined" || Notification.permission !== "granted") continue
      if (document.visibilityState === "visible") continue
      const kind = n.kind ?? "info"
      if (kind !== "info" && !prefs[kind as keyof typeof prefs]) continue
      if (prefs.quiet && inQuiet(prefs.quietFrom, prefs.quietTo)) continue
      try {
        new Notification(n.title, { body: prefs.preview ? n.text : "Ada pembaruan baru dari Hadirku.", silent: !prefs.sound, tag: n.id })
      } catch {
        /* some mobile browsers only allow service-worker notifications */
      }
    }
  }, [db, user])
}
