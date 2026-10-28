import { useState, type FormEvent } from "react"
import { Icon } from "../components/Icon"
import { navigate } from "../lib/router"
import { addSchedule, removeSchedule } from "../lib/store"
import type { User } from "../lib/types"

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]
const ORDER = [1, 2, 3, 4, 5, 6]

export function TeacherSchedule({ user }: { user: User }) {
  const items = [...(user.schedule ?? [])].sort((a, b) => a.start.localeCompare(b.start))
  const today = new Date().getDay()
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ day: today >= 1 && today <= 6 ? today : 1, start: "07:15", end: "08:45", className: user.classes?.[0] ?? "", subject: user.subject ?? "" })
  const [error, setError] = useState("")

  const submit = (e: FormEvent) => {
    e.preventDefault()
    try {
      addSchedule(user.id, f)
      setError("")
      setAdding(false)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="screen-content sub-screen">
      <header className="title-header with-back">
        <button className="back-link" onClick={() => navigate("/guru/akun")} aria-label="Kembali"><Icon name="chevron" size={18} /></button>
        <div><p>AKUN GURU</p><h1>Jadwal mengajar</h1></div>
      </header>
      <p className="sch-hint">Pengingat dikirim 10 menit sebelum jam mulai ke panel notifikasi, sesuai pengaturan notifikasi Anda.</p>
      {ORDER.map((day) => {
        const list = items.filter((i) => i.day === day)
        if (!list.length && day === 6) return null
        return (
          <section key={day} className="sch-day">
            <h2>{DAYS[day]}{day === today && <em>Hari ini</em>}</h2>
            {list.length === 0 && <p className="sch-empty">Tidak ada jadwal</p>}
            {list.map((i) => (
              <div key={i.id} className="sch-item">
                <time>{i.start.replace(":", ".")}<small>{i.end.replace(":", ".")}</small></time>
                <div><strong>{i.subject}</strong><small>{i.className}</small></div>
                <button aria-label={`Hapus ${i.subject} ${i.className}`} onClick={() => removeSchedule(user.id, i.id)}><Icon name="close" size={15} /></button>
              </div>
            ))}
          </section>
        )
      })}
      {adding ? (
        <form className="link-form sch-form" onSubmit={submit}>
          <label>Hari
            <select value={f.day} onChange={(e) => setF({ ...f, day: Number(e.target.value) })}>
              {ORDER.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
            </select>
          </label>
          <div className="sch-times">
            <label>Mulai<input type="time" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
            <label>Selesai<input type="time" required value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
          </div>
          <label>Mata pelajaran<input required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
          <label>Kelas<input required value={f.className} onChange={(e) => setF({ ...f, className: e.target.value })} placeholder="XI RPL 1" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit">Simpan jadwal <Icon name="arrow" size={18} /></button>
          <button type="button" className="sheet-cancel" onClick={() => { setAdding(false); setError("") }}>Batal</button>
        </form>
      ) : (
        <button className="primary-button" onClick={() => setAdding(true)}>Tambah jadwal <Icon name="arrow" size={18} /></button>
      )}
    </div>
  )
}
