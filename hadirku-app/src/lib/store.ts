import { useSyncExternalStore } from "react"
import type { ScheduleItem, Attendance, DB, Device, Leave, NotifPrefs, Notice, Role, Session, Status, Student, User } from "./types"
import { dateKey, timeKey, uid } from "./util"
import {
  getToken, setToken, apiLogin, apiRegisterParent, apiRegisterStudent, apiRegisterTeacher,
  apiGetMe, apiGetStudents, apiGetActiveSession, apiGetLiveSession, apiOpenSession,
  apiCloseSession, apiCheckin, apiMarkManual, apiGetStudentAttendance, apiGetClassAttendance,
  apiGetLeaves, apiSubmitLeave, apiDecideLeave, apiGetNotices, apiMarkAllRead,
  apiUpdateMe, apiChangePassword, apiUpdatePrefs, apiTouchDevice, apiRevokeDevice,
  apiRevokeOtherDevices, apiAddStudent, apiDeleteStudent, apiAddSchedule, apiDeleteSchedule,
  type ApiUser, type RegisterParentInput, type RegisterStudentInput, type RegisterTeacherInput
} from "./api"

const SESSION_KEY = "hadirku:user"
const CACHE_KEY = "hadirku:cache:db"
export const SLOT_MS = 30000
export const LATE_AFTER_MIN = 15

// Initial state loaded from cache if present, else empty
function loadInitial(): DB {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw) as DB
  } catch {}
  return {
    users: [],
    students: [],
    sessions: [],
    attendance: [],
    leaves: [],
    notices: [],
  }
}

let db: DB = loadInitial()
let authId: string | null = sessionStorage.getItem(SESSION_KEY)
const listeners = new Set<() => void>()
const emit = () => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(db))
  } catch {}
  listeners.forEach((l) => l())
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export const useDB = () => useSyncExternalStore(subscribe, () => db)
export const useAuthId = () => useSyncExternalStore(subscribe, () => authId)
export const getDB = () => db

export function useUser(): User | undefined {
  const d = useDB()
  const id = useAuthId()
  return d.users.find((u) => u.id === id)
}

export const roleName = (r: Role) => (r === "parent" ? "orang tua" : r === "teacher" ? "guru" : "siswa")

// ─── Backend Synchronization (MySQL to In-Memory DB) ─────────

function normalizeApiUser(me: ApiUser): User {
  return {
    id: me.id,
    role: me.role,
    name: me.name,
    email: me.email,
    phone: me.phone,
    avatar: me.avatar_url,
    avatar_url: me.avatar_url,
    studentId: me.student_id,
    student_id: me.student_id,
    nip: me.nip,
    subject: me.subject,
    classes: me.classes,
    schedule: me.schedule,
    prefs: me.prefs as any,
    devices: me.devices as any,
    passSet: !!me.pass_set,
  }
}

export async function syncFromBackend() {
  const token = getToken()
  if (!token) {
    authId = null
    sessionStorage.removeItem(SESSION_KEY)
    emit()
    return
  }

  try {
    const me = await apiGetMe()
    const currentUser = normalizeApiUser(me)
    authId = me.id
    sessionStorage.setItem(SESSION_KEY, me.id)

    // Fetch real students from MySQL
    const apiStudents = await apiGetStudents().catch(() => [])
    const students: Student[] = apiStudents.map(s => ({
      id: s.id,
      nis: s.nis,
      name: s.name,
      className: s.class_name,
    }))

    // Fetch real leaves from MySQL
    const apiLeaves = await apiGetLeaves().catch(() => [])
    const leaves: Leave[] = apiLeaves.map(l => ({
      id: l.id,
      studentId: l.student_id,
      parentId: l.parent_id,
      type: l.leave_type,
      date: typeof l.leave_date === 'string' ? l.leave_date.slice(0, 10) : dateKey(),
      reason: l.reason,
      proofName: l.proof_name,
      proofData: l.proof_url,
      status: l.status,
      createdAt: new Date(l.created_at).getTime(),
    }))

    // Fetch real notices from MySQL
    const apiNotices = await apiGetNotices().catch(() => [])
    const notices: Notice[] = apiNotices.map(n => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      kind: n.kind as any,
      title: n.title,
      text: n.text,
      at: n.at,
      read: n.read,
    }))

    // Fetch real attendance from MySQL
    let attendance: Attendance[] = []
    if ((me.role === 'student' || me.role === 'parent') && me.student_id) {
      const apiAtt = await apiGetStudentAttendance(me.student_id).catch(() => [])
      attendance = apiAtt.map(a => ({
        id: a.id,
        studentId: a.student_id,
        date: typeof a.attend_date === 'string' ? a.attend_date.slice(0, 10) : dateKey(),
        sessionId: a.session_id,
        status: a.status,
        time: a.time_str || "—",
        at: new Date(a.recorded_at).getTime(),
        manual: !!a.is_manual,
        self: !!a.is_self,
      }))
    } else if (me.role === 'teacher' && me.classes?.length) {
      for (const cls of me.classes) {
        const classData = await apiGetClassAttendance(cls).catch(() => null)
        if (classData?.attendance) {
          attendance.push(...classData.attendance.map(a => ({
            id: a.id,
            studentId: a.student_id,
            date: typeof a.attend_date === 'string' ? a.attend_date.slice(0, 10) : dateKey(),
            sessionId: a.session_id,
            status: a.status,
            time: a.time_str || "—",
            at: new Date(a.recorded_at).getTime(),
            manual: !!a.is_manual,
            self: !!a.is_self,
          })))
        }
      }
    }

    // Fetch active session from MySQL
    let sessions: Session[] = []
    if (me.role === 'teacher') {
      const act = await apiGetActiveSession().catch(() => null)
      if (act) sessions.push(act)
    } else if (me.role === 'student') {
      const st = students.find(s => s.id === me.student_id)
      if (st) {
        const live = await apiGetLiveSession(st.className).catch(() => null)
        if (live) sessions.push(live)
      }
    }

    // Update in-memory DB with real MySQL records
    db = {
      users: [currentUser],
      students,
      sessions,
      attendance,
      leaves,
      notices,
    }
    emit()
    touchDevice(me.id)
  } catch (err) {
    console.error("Gagal sinkronisasi data dari MySQL:", err)
  }
}

export const initAuth = () => syncFromBackend()

// ─── Authentication Operations ────────────────────────────────

export async function login(email: string, password: string, role: Role): Promise<User> {
  const { token, user: apiUser } = await apiLogin(email, password, role)
  setToken(token)
  await syncFromBackend()
  const user = normalizeApiUser(apiUser)
  authId = user.id
  return user
}

export async function loginWithToken(token: string): Promise<User> {
  setToken(token)
  await syncFromBackend()
  const me = await apiGetMe()
  const user = normalizeApiUser(me)
  authId = user.id
  return user
}

export function logout() {
  setToken(null)
  authId = null
  sessionStorage.removeItem(SESSION_KEY)
  db = { users: [], students: [], sessions: [], attendance: [], leaves: [], notices: [] }
  emit()
}

export async function registerParent(i: RegisterParentInput): Promise<User> {
  const { token, user: apiUser } = await apiRegisterParent(i)
  setToken(token)
  await syncFromBackend()
  return normalizeApiUser(apiUser)
}

export async function registerStudent(i: RegisterStudentInput): Promise<User> {
  const { token, user: apiUser } = await apiRegisterStudent(i)
  setToken(token)
  await syncFromBackend()
  return normalizeApiUser(apiUser)
}

export async function registerTeacher(i: RegisterTeacherInput): Promise<User> {
  const { token, user: apiUser } = await apiRegisterTeacher(i)
  setToken(token)
  await syncFromBackend()
  return normalizeApiUser(apiUser)
}

export function findStudentByNis(nis: string) {
  return db.students.find((s) => s.nis === nis.trim())
}

// ─── Sessions & Attendance Operations ─────────────────────────

export const isLive = (s?: Session, now = Date.now()) => !!s && !s.closedAt && now < s.endsAt

export function activeSession(d: DB, teacherId: string, now = Date.now()) {
  return d.sessions.find((s) => s.teacherId === teacherId && isLive(s, now))
}

export function liveSessionFor(d: DB, className: string, now = Date.now()) {
  return d.sessions.find((s) => s.className === className && isLive(s, now))
}

export async function openSession(teacherId: string, className: string, subject: string, minutes: number): Promise<Session> {
  const session = await apiOpenSession(className, subject, minutes)
  await syncFromBackend()
  return session
}

export async function closeSession(sessionId: string) {
  await apiCloseSession(sessionId)
  await syncFromBackend()
}

export const qrSlot = (now = Date.now()) => Math.floor(now / SLOT_MS)
const sign = (s: Session, slot: number) =>
  (Array.from(`${s.secret}:${s.id}:${slot}`).reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261)).toString(36)

export const makeToken = (s: Session, now = Date.now()) => {
  const slot = qrSlot(now)
  return `${s.id}.${slot}.${sign(s, slot)}`
}

export function readToken(token: string): { session?: Session; error?: string } {
  const [sid, slotStr, sig] = token.split(".")
  const s = db.sessions.find((x) => x.id === sid)
  if (!s) return { error: "Kode QR tidak dikenali di sistem." }
  const slot = Number(slotStr)
  if (!sig || sign(s, slot) !== sig) return { error: "Kode QR tidak valid." }
  if (!isLive(s)) return { error: "Sesi absensi sudah ditutup.", session: s }
  if (qrSlot() - slot > 3) return { error: "Kode QR sudah kedaluwarsa. Scan QR terbaru dari layar guru.", session: s }
  return { session: s }
}

export async function checkIn(token: string, nis: string, self = false): Promise<{ student: Student; attendance: Attendance; already: boolean }> {
  const res = await apiCheckin(token, nis, self)
  await syncFromBackend()
  const student = findStudentByNis(nis) || { id: res.attendance.student_id, nis, name: "Siswa", className: "" }
  const att: Attendance = {
    id: res.attendance.id,
    studentId: res.attendance.student_id,
    date: res.attendance.attend_date.slice(0, 10),
    sessionId: res.attendance.session_id,
    status: res.attendance.status,
    time: res.attendance.time_str || timeKey(),
    at: Date.now(),
    self,
  }
  return { student, attendance: att, already: !!res.already }
}

export async function markManual(sessionId: string, studentId: string, status: Status) {
  await apiMarkManual(sessionId, studentId, status)
  await syncFromBackend()
}

export async function addStudent(className: string, nis: string, name: string) {
  if (!nis.trim() || !name.trim()) throw new Error("Isi NIS dan nama siswa.")
  await apiAddStudent(nis.trim(), name.trim(), className)
  await syncFromBackend()
}

export async function removeStudent(id: string) {
  await apiDeleteStudent(id)
  await syncFromBackend()
}

// ─── Leaves Operations ────────────────────────────────────────

export async function submitLeave(input: Omit<Leave, "id" | "status" | "createdAt">) {
  await apiSubmitLeave({
    type: input.type,
    date: input.date,
    reason: input.reason,
    proofName: input.proofName,
    proofUrl: input.proofData,
  })
  await syncFromBackend()
}

export async function decideLeave(id: string, decision: "approved" | "rejected") {
  await apiDecideLeave(id, decision)
  await syncFromBackend()
}

// ─── Notices Operations ───────────────────────────────────────

export async function markAllRead(_userId?: string) {
  await apiMarkAllRead()
  await syncFromBackend()
}

// ─── Derived Calculations ─────────────────────────────────────

const rank: Record<Status, number> = { hadir: 4, terlambat: 3, izin: 2, sakit: 2, alpa: 1 }

export function dayStatus(d: DB, studentId: string, date: string): Status | undefined {
  const recs = d.attendance.filter((a) => a.studentId === studentId && a.date === date)
  if (recs.length) return recs.reduce((b, a) => (rank[a.status] > rank[b.status] ? a : b)).status
  return d.leaves.find((l) => l.studentId === studentId && l.date === date && l.status === "approved")?.type
}

export function dayRecord(d: DB, studentId: string, date: string): Attendance | undefined {
  return d.attendance
    .filter((a) => a.studentId === studentId && a.date === date && (a.status === "hadir" || a.status === "terlambat"))
    .sort((a, b) => a.at - b.at)[0]
}

export interface Tally { hadir: number; terlambat: number; izin: number; sakit: number; alpa: number; total: number; rate: number }
export function tally(records: Attendance[]): Tally {
  const t = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, total: records.length, rate: 0 }
  records.forEach((r) => t[r.status]++)
  t.rate = t.total ? Math.round(((t.hadir + t.terlambat) / t.total) * 100) : 0
  return t
}

export const studentsOf = (d: DB, className: string) =>
  d.students.filter((s) => s.className === className).sort((a, b) => a.name.localeCompare(b.name))

// ─── Account & Device Operations ──────────────────────────────

export const defaultPrefs: NotifPrefs = {
  push: false, reminder: true, checkin: true, late: true, absent: true, leave: true, session: false,
  preview: true, sound: true, quiet: false, quietFrom: "21:00", quietTo: "05:30",
}

const DEVICE_KEY = "hadirku:device-id"
export const deviceId = () => {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

function describeDevice(): Pick<Device, "name" | "kind" | "browser"> {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser"
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Perangkat"
  const kind = /Android|iPhone|iPad|Mobile/.test(ua) ? "phone" : "desktop"
  return { name: `${os} · ${browser}`, kind, browser }
}

export async function touchDevice(_userId: string) {
  const dev = describeDevice()
  await apiTouchDevice({ deviceKey: deviceId(), ...dev }).catch(() => {})
}

export async function revokeDevice(_userId: string, id: string) {
  await apiRevokeDevice(id)
  await syncFromBackend()
}

export async function revokeOthers(_userId: string) {
  await apiRevokeOtherDevices(deviceId())
  await syncFromBackend()
}

export async function updateProfile(_userId: string, p: { name: string; email: string; phone: string; avatar?: string }) {
  await apiUpdateMe(p)
  await syncFromBackend()
}

export async function setPrefs(_userId: string, prefs: NotifPrefs) {
  await apiUpdatePrefs(prefs as any)
  await syncFromBackend()
}

export const needsCurrentPassword = (u: User) => !(u.provider && !u.passSet)

export async function changePassword(_userId: string, current: string, next: string) {
  await apiChangePassword(current, next)
  await syncFromBackend()
}

// ─── Teaching Schedule Operations ─────────────────────────────

export async function addSchedule(_userId: string, i: Omit<ScheduleItem, "id">) {
  await apiAddSchedule(i)
  await syncFromBackend()
}

export async function removeSchedule(_userId: string, id: string) {
  await apiDeleteSchedule(id)
  await syncFromBackend()
}
