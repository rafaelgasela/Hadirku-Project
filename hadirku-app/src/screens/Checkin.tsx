import { useState, type FormEvent } from "react"
import { Brand } from "../components/Brand"
import { Icon } from "../components/Icon"
import { navigate } from "../lib/router"
import { checkIn, getDB, readToken, useDB, useUser } from "../lib/store"
import { homeOf } from "./Auth"
import { statusLabel } from "../lib/util"

const LAST = "hadirku:last-nis"

export function Checkin({ token }: { token: string }) {
  useDB()
  const user = useUser()
  const linked = user?.studentId ? getDB().students.find((s) => s.id === user.studentId)?.nis : undefined
  const [nis, setNis] = useState(linked ?? localStorage.getItem(LAST) ?? "")
  const [error, setError] = useState("")
  const [done, setDone] = useState<Awaited<ReturnType<typeof checkIn>> | null>(null)
  const info = readToken(token)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    try {
      const r = await checkIn(token, nis, user?.role === "student")
      localStorage.setItem(LAST, nis.trim())
      setDone(r)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="screen-content link-screen no-nav checkin">
      <header className="app-header">
        <Brand />
      </header>

      {done ? (
        <section className="leave-success">
          <span className={done.attendance.status === "terlambat" ? "warn" : ""}>
            <Icon name="check" size={25} />
          </span>
          <h2>{done.already ? "Sudah tercatat" : "Check-in berhasil"}</h2>
          <p>
            {done.student.name} · {done.student.className}
          </p>
          <div>
            <small>STATUS</small>
            <strong>
              {statusLabel[done.attendance.status]} · {done.attendance.time.replace(":", ".")} WIB
            </strong>
          </div>
          <button onClick={() => navigate(user ? homeOf(user.role) : "/masuk")}>
            {user ? "Kembali ke beranda" : "Selesai"}
          </button>
        </section>
      ) : (
        <>
          <header className="title-header">
            <p>ABSENSI KELAS</p>
            <h1>Check-in kehadiran</h1>
          </header>
          {info.session && (
            <section className="leave-student">
              <div className="student-avatar small">QR</div>
              <div>
                <span>Sesi absensi</span>
                <strong>{info.session.subject}</strong>
                <small>Kelas {info.session.className}</small>
              </div>
            </section>
          )}
          {info.error ? (
            <p className="form-error" role="alert">{info.error}</p>
          ) : (
            <form className="link-form" onSubmit={submit}>
              <label>
                Nomor induk siswa (NIS)
                <input required inputMode="numeric" autoFocus value={nis} onChange={(e) => setNis(e.target.value)} placeholder="Contoh: 20250123" />
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button" type="submit">
                Catat kehadiran <Icon name="arrow" size={18} />
              </button>
            </form>
          )}
          {!user && (
            <button className="sheet-cancel" onClick={() => navigate("/masuk")}>
              Ke halaman masuk
            </button>
          )}
        </>
      )}
    </div>
  )
}
