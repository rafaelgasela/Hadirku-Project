import { useEffect, useRef, useState, type FormEvent } from "react"
import jsQR from "jsqr"
import { PersonalData, NotifSettings, Security } from "./ParentAccount"
import { BottomNav } from "../components/Nav"
import { Avatar } from "../components/Avatar"
import { Icon } from "../components/Icon"
import { useNow } from "../components/Hooks"
import { navigate } from "../lib/router"
import { checkIn, dayRecord, dayStatus, liveSessionFor, logout, tally, useDB } from "../lib/store"
import { ConfirmLogoutModal } from "../components/ConfirmLogoutModal"
import type { Student as StudentRow, User } from "../lib/types"
import { dateKey, greeting, initials, longDate, prettyDate, statusLabel, statusTone } from "../lib/util"

const NAV = [
  { path: "/siswa", label: "Beranda", icon: "home" as const },
  { path: "/siswa/scan", label: "Scan QR", icon: "qr" as const },
  { path: "/siswa/riwayat", label: "Riwayat", icon: "history" as const },
  { path: "/siswa/akun", label: "Akun", icon: "user" as const },
]

export function Student({ user, route }: { user: User; route: string }) {
  const db = useDB()
  const student = db.students.find((s) => s.id === user.studentId)
  if (!student) return <div className="screen-content"><p className="form-error">Data siswa tidak ditemukan.</p></div>
  const parents = db.users.filter((u) => u.role === "parent" && u.studentId === student.id)
  const props = { user, student, parents }
  return (
    <>
      {route === "/siswa/scan" ? <Scan {...props} /> : route === "/siswa/riwayat" ? <History {...props} /> : route === "/siswa/akun/data" ? <PersonalData user={user} /> : route === "/siswa/akun/notifikasi" ? <NotifSettings user={user} /> : route === "/siswa/akun/keamanan" ? <Security user={user} /> : route === "/siswa/akun" ? <Account {...props} /> : <Home {...props} />}
      <BottomNav items={NAV} route={route.startsWith("/siswa/akun") ? "/siswa/akun" : route} label="Navigasi siswa" />
    </>
  )
}

type P = { user: User; student: StudentRow; parents: User[] }

function ParentLink({ parents, student }: { parents: User[]; student: StudentRow }) {
  return (
    <section className="st-parents">
      <span><Icon name="shield" size={17} /></span>
      <div>
        <strong>{parents.length ? `Terkirim ke ${parents.map((p) => p.name.split(" ")[0]).join(", ")}` : "Belum ada orang tua terhubung"}</strong>
        <small>
          {parents.length
            ? `Setiap check-in ${student.name.split(" ")[0]} langsung masuk ke aplikasi orang tua.`
            : "Minta orang tua mendaftar dengan NIS " + student.nis + " agar kehadiranmu terpantau."}
        </small>
      </div>
    </section>
  )
}

function Home({ user, student, parents }: P) {
  const db = useDB()
  const now = useNow(5000)
  const today = dateKey()
  const status = dayStatus(db, student.id, today)
  const rec = dayRecord(db, student.id, today)
  const live = liveSessionFor(db, student.className, now)
  const t = tally(db.attendance.filter((a) => a.studentId === student.id && a.date.slice(0, 7) === today.slice(0, 7)))
  const label = status ? (status === "hadir" || status === "terlambat" ? `${statusLabel[status]} di sekolah` : status === "alpa" ? "Tidak hadir" : statusLabel[status]) : live ? "Belum check-in" : "Belum ada sesi hari ini"
  return (
    <div className="screen-content">
      <header className="app-header">
        <div>
          <p>{longDate().toUpperCase()}</p>
          <h1>{greeting()}, {user.name.split(" ")[0]}</h1>
        </div>
      </header>

      <section className="student-card">
        <div className="student-top">
          <div className="student-avatar">{initials(student.name)}</div>
          <div className="student-name">
            <span>Siswa</span>
            <strong>{student.name}</strong>
            <small>{student.className} · NIS {student.nis}</small>
          </div>
        </div>
        <div className={`live-status ${statusTone(status)}`}>
          <span className="pulse"><i /></span>
          <div>
            <small>STATUS HARI INI</small>
            <strong>{label}</strong>
          </div>
          <time>{rec ? `${rec.time.replace(":", ".")} WIB` : ""}</time>
        </div>
      </section>

      <button className="st-scan-cta" onClick={() => navigate("/siswa/scan")} disabled={!!status && status !== "alpa" && !live}>
        <span><Icon name="qr" size={26} /></span>
        <div>
          <strong>{live && !status ? "Scan QR untuk absen" : "Buka pemindai QR"}</strong>
          <small>{live ? `Sesi ${live.subject} sedang dibuka` : "Menunggu guru membuka sesi absensi"}</small>
        </div>
        <Icon name="chevron" size={18} />
      </button>

      <ParentLink parents={parents} student={student} />

      <section className="stats">
        <article>
          <span className="stat-icon purple"><Icon name="calendar" size={19} /></span>
          <div><strong>{t.total ? `${t.rate}%` : "—"}</strong><small>Kehadiran</small></div>
          <b>Bulan ini</b>
        </article>
        <article>
          <span className="stat-icon lavender"><Icon name="clock" size={19} /></span>
          <div><strong>{t.terlambat}×</strong><small>Terlambat</small></div>
          <b>Bulan ini</b>
        </article>
      </section>
    </div>
  )
}

const tokenOf = (text: string) => {
  const m = text.match(/checkin\/([^\s?#]+)/)
  return decodeURIComponent((m ? m[1] : text.trim()))
}

function Scan({ student, parents }: P) {
  const video = useRef<HTMLVideoElement>(null)
  const [cam, setCam] = useState<"idle" | "on" | "denied">("idle")
  const [manual, setManual] = useState("")
  const [error, setError] = useState("")
  const [done, setDone] = useState<Awaited<ReturnType<typeof checkIn>> | null>(null)
  const handled = useRef(false)

  const submit = async (raw: string) => {
    if (handled.current) return
    setError("")
    try {
      const r = await checkIn(tokenOf(raw), student.nis, true)
      handled.current = true
      setDone(r)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const submitRef = useRef(submit)
  submitRef.current = submit

  useEffect(() => {
    if (done) return
    let stream: MediaStream | undefined
    let raf = 0
    let alive = true
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    let last = 0
    const tick = () => {
      const v = video.current
      if (!alive || !v) return
      if (v.readyState >= 2 && v.videoWidth) {
        canvas.width = v.videoWidth
        canvas.height = v.videoHeight
        ctx.drawImage(v, 0, 0)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })
        if (code?.data && Date.now() - last > 1500) {
          last = Date.now()
          submitRef.current(code.data)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    navigator.mediaDevices?.getUserMedia?.({ video: { facingMode: "environment" } })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) {
          video.current.srcObject = s
          video.current.play().catch(() => {})
        }
        setCam("on")
        tick()
      })
      .catch(() => alive && setCam("denied"))
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [done])

  if (done)
    return (
      <div className="screen-content sub-screen">
        <section className="leave-success">
          <span className={done.attendance.status === "terlambat" ? "warn" : ""}><Icon name="check" size={25} /></span>
          <h2>{done.already ? "Sudah tercatat" : "Check-in berhasil"}</h2>
          <p>{done.student.name} · {done.student.className}</p>
          <div>
            <small>STATUS</small>
            <strong>{statusLabel[done.attendance.status]} · {done.attendance.time.replace(":", ".")} WIB</strong>
          </div>
          <p className="st-sent">
            <Icon name="shield" size={13} />
            {parents.length ? `Kabar sudah dikirim ke ${parents.map((p) => p.name).join(", ")}.` : "Belum ada orang tua terhubung."}
          </p>
          <button onClick={() => navigate("/siswa")}>Kembali ke beranda</button>
        </section>
      </div>
    )

  return (
    <div className="screen-content sub-screen">
      <header className="title-header">
        <p>ABSENSI KELAS</p>
        <h1>Scan QR guru</h1>
      </header>
      <div className="st-viewfinder">
        <video ref={video} muted playsInline />
        {cam !== "on" && (
          <div className="st-cam-off">
            <Icon name="qr" size={34} />
            <p>{cam === "denied" ? "Kamera tidak bisa dibuka. Izinkan akses kamera di browser, atau tempel tautan QR di bawah." : "Membuka kamera…"}</p>
          </div>
        )}
        {cam === "on" && <i className="st-frame" />}
      </div>
      <p className="link-hint"><Icon name="shield" size={13} />Arahkan kamera ke QR di layar guru. Kode berganti tiap 30 detik.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form className="link-form st-manual" onSubmit={(e: FormEvent) => { e.preventDefault(); submit(manual) }}>
        <label>
          Atau tempel tautan QR
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…#/checkin/kode" />
        </label>
        <button className="primary-button" type="submit" disabled={!manual.trim()}>
          Catat kehadiran <Icon name="arrow" size={18} />
        </button>
      </form>
    </div>
  )
}

function History({ student }: P) {
  const db = useDB()
  const rows = db.attendance.filter((a) => a.studentId === student.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40)
  const t = tally(db.attendance.filter((a) => a.studentId === student.id))
  return (
    <div className="screen-content sub-screen">
      <header className="title-header">
        <p>RIWAYAT</p>
        <h1>Kehadiranku</h1>
      </header>
      <section className="stats">
        <article><div><strong>{t.total ? `${t.rate}%` : "—"}</strong><small>Kehadiran</small></div><b>{t.hadir + t.terlambat}/{t.total}</b></article>
        <article><div><strong>{t.alpa}</strong><small>Tidak hadir</small></div><b>Total</b></article>
      </section>
      <section className="history-list st-hist">
        {rows.length === 0 && <p className="empty-note">Belum ada riwayat.</p>}
        {rows.map((a) => (
          <article key={a.id}>
            <div><strong>{prettyDate(a.date)}</strong><small>{a.time === "—" ? "—" : `${a.time.replace(":", ".")} WIB`}{a.self ? " · scan sendiri" : a.manual ? " · dicatat guru" : ""}</small></div>
            <span className={`history-status ${statusTone(a.status)}`}><i /> {statusLabel[a.status]}</span>
          </article>
        ))}
      </section>
    </div>
  )
}

function Account({ user, student, parents }: P) {
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  return (
    <div className="screen-content sub-screen">
      <header className="title-header">
        <p>AKUN SISWA</p>
        <h1>Profil</h1>
      </header>
      <section className="profile-card">
        <Avatar name={user.name} src={user.avatar} />
        <strong>{user.name}</strong>
        <span>{student.className} · NIS {student.nis}</span>
        <small>{user.email}</small>
      </section>
      <section className="settings-card">
        {([
          ["user", "Data pribadi", user.phone ? `Foto, nama, email, ${user.phone}` : "Foto, nama, email, dan nomor telepon", "/siswa/akun/data"],
          ["bell", "Pengaturan notifikasi", "Panel notifikasi HP dan jenis kabar", "/siswa/akun/notifikasi"],
          ["shield", "Keamanan akun", "Perangkat masuk dan ganti password", "/siswa/akun/keamanan"],
        ] as const).map(([icon, title, copy, to]) => (
          <button key={to} onClick={() => navigate(to)}>
            <span><Icon name={icon} size={18} /></span>
            <div><strong>{title}</strong><small>{copy}</small></div>
            <Icon name="chevron" size={17} />
          </button>
        ))}
      </section>
      <section className="st-parent-list">
        <p className="list-label">ORANG TUA TERHUBUNG</p>
        {parents.length === 0 && <p className="empty-note">Belum ada. Orang tua mendaftar memakai NIS {student.nis}.</p>}
        {parents.map((p) => (
          <article key={p.id}><div className="st-p-av">{initials(p.name)}</div><div><strong>{p.name}</strong><small>{p.email}</small></div></article>
        ))}
      </section>
      <button className="logout-button" type="button" onClick={() => setShowLogoutModal(true)}>
        <Icon name="logout" size={18} /> Keluar dari akun
      </button>

      <ConfirmLogoutModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={() => {
          logout()
          sessionStorage.setItem("hadirku:logged_out", "1")
          navigate("/masuk?logged_out=1", true)
        }}
      />
    </div>
  )
}
