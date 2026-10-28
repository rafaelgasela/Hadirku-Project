import { useMemo, useState, type FormEvent } from "react"
import { BottomNav } from "../components/Nav"
import { Icon } from "../components/Icon"
import { navigate } from "../lib/router"
import {
  dayRecord, dayStatus, liveSessionFor, logout, markAllRead, submitLeave, tally, useDB,
} from "../lib/store"
import type { Status, User } from "../lib/types"
import { ago, dateKey, dayShort, downloadCsv, fromKey, greeting, initials, longDate, monthLabel, prettyDate, statusLabel, statusTone } from "../lib/util"
import { useNow } from "../components/Hooks"
import { Avatar } from "../components/Avatar"
import { NotifSettings, PersonalData, Security } from "./ParentAccount"
import { ConfirmLogoutModal } from "../components/ConfirmLogoutModal"

const NAV = (unread: boolean) => [
  { path: "/ortu", label: "Beranda", icon: "home" as const },
  { path: "/ortu/riwayat", label: "Riwayat", icon: "history" as const },
  { path: "/ortu/izin", label: "Izin", icon: "file" as const },
  { path: "/ortu/notifikasi", label: "Notifikasi", icon: "bell" as const, badge: unread },
  { path: "/ortu/akun", label: "Akun", icon: "user" as const },
]

export function Parent({ user, route }: { user: User; route: string }) {
  const db = useDB()
  const student = db.students.find((s) => s.id === user.studentId)
  const unread = db.notices.some((n) => n.userId === user.id && !n.read)
  if (!student) return <div className="screen-content"><p className="form-error">Data siswa tidak ditemukan.</p></div>
  const props = { user, student }
  return (
    <>
      {route === "/ortu/akun/data" ? <PersonalData user={user} /> : route === "/ortu/akun/notifikasi" ? <NotifSettings user={user} /> : route === "/ortu/akun/keamanan" ? <Security user={user} /> : route === "/ortu/riwayat" ? <History {...props} /> : route === "/ortu/izin" ? <Leave {...props} /> : route === "/ortu/notifikasi" ? <Alerts user={user} /> : route === "/ortu/akun" ? <Profile {...props} /> : <Home {...props} />}
      <BottomNav items={NAV(unread)} route={route.startsWith("/ortu/akun") ? "/ortu/akun" : route} label="Navigasi orang tua" />
    </>
  )
}

type P = { user: User; student: { id: string; nis: string; name: string; className: string } }

function weekDates() {
  const d = new Date()
  const mon = new Date(d)
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(mon)
    x.setDate(mon.getDate() + i)
    return dateKey(x)
  })
}

function Home({ user, student }: P) {
  const db = useDB()
  const now = useNow(5000)
  const [closed, setClosed] = useState(false)
  const today = dateKey()
  const status = dayStatus(db, student.id, today)
  const rec = dayRecord(db, student.id, today)
  const live = liveSessionFor(db, student.className, now)
  const unread = db.notices.filter((n) => n.userId === user.id && !n.read)
  const mine = db.attendance.filter((a) => a.studentId === student.id && a.date.slice(0, 7) === today.slice(0, 7))
  const t = tally(mine)
  const week = weekDates()
  const wk = week.map((d) => ({ d, s: dayStatus(db, student.id, d) }))
  const label = status ? (status === "hadir" || status === "terlambat" ? `${statusLabel[status]} di sekolah` : status === "alpa" ? "Tidak hadir" : statusLabel[status]) : live ? "Belum check-in" : "Belum ada sesi hari ini"
  const latest = unread[0]

  return (
    <div className="screen-content">
      <header className="app-header">
        <div>
          <p>{longDate().toUpperCase()}</p>
          <h1>{greeting()}, {user.name.split(" ")[0]}</h1>
        </div>
        <button className="header-bell" aria-label="Notifikasi" onClick={() => navigate("/ortu/notifikasi")}>
          <Icon name="bell" />
          {unread.length > 0 && <i />}
        </button>
      </header>

      <section className="student-card">
        <div className="student-top">
          <div className="student-avatar">{initials(student.name)}</div>
          <div className="student-name">
            <span>Anak Anda</span>
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

      {latest && !closed && (
        <section className="info-alert">
          <span><Icon name={latest.type === "success" ? "check" : "bell"} size={16} /></span>
          <div>
            <strong>{latest.title}</strong>
            <p>{latest.text}</p>
          </div>
          <button aria-label="Tutup informasi" onClick={() => setClosed(true)}><Icon name="close" size={15} /></button>
        </section>
      )}

      <section className="stats">
        <article>
          <span className="stat-icon purple"><Icon name="calendar" size={19} /></span>
          <div><strong>{t.total ? `${t.rate}%` : "—"}</strong><small>Kehadiran</small></div>
          <b>{!t.total ? "Baru" : t.rate >= 90 ? "Baik" : t.rate >= 75 ? "Cukup" : "Rendah"}</b>
        </article>
        <article>
          <span className="stat-icon lavender"><Icon name="clock" size={19} /></span>
          <div><strong>{t.terlambat}×</strong><small>Terlambat</small></div>
          <b>Bulan ini</b>
        </article>
      </section>

      <button className="leave-shortcut" onClick={() => navigate("/ortu/izin")}>
        <span><Icon name="file" size={19} /></span>
        <div>
          <strong>Ajukan izin atau sakit</strong>
          <small>Kirim keterangan dan bukti ke sekolah</small>
        </div>
        <Icon name="chevron" size={17} />
      </button>

      <section className="content-section">
        <div className="section-heading">
          <div><span>MINGGU INI</span><h2>Ringkasan kehadiran</h2></div>
          <button onClick={() => navigate("/ortu/riwayat")}>Lihat riwayat <Icon name="chevron" size={14} /></button>
        </div>
        <div className="week-card">
          {wk.map(({ d, s }) => (
            <div className={`week-day ${statusTone(s)}`} key={d}>
              <span>{dayShort(d)}</span>
              <strong>{fromKey(d).getDate()}</strong>
              <i>{s === "hadir" ? <Icon name="check" size={10} /> : s === "terlambat" ? "!" : s === "izin" || s === "sakit" ? "I" : s === "alpa" ? "×" : "·"}</i>
            </div>
          ))}
        </div>
        <div className="week-legend">
          <span><i className="present-dot" /> {wk.filter((x) => x.s === "hadir").length} hadir</span>
          <span><i className="late-dot" /> {wk.filter((x) => x.s === "terlambat").length} terlambat</span>
          <span><i className="permit-dot" /> {wk.filter((x) => x.s === "izin" || x.s === "sakit").length} izin</span>
        </div>
      </section>

      <section className="content-section lesson-section">
        <div className="section-heading">
          <div><span>SEKARANG</span><h2>Sesi kelas</h2></div>
        </div>
        {live ? (
          <article className="lesson-card">
            <span className="lesson-icon"><Icon name="book" /></span>
            <div>
              <small>{new Date(live.startedAt).toTimeString().slice(0, 5).replace(":", ".")} — {new Date(live.endsAt).toTimeString().slice(0, 5).replace(":", ".")}</small>
              <strong>{live.subject}</strong>
              <span>Kelas {live.className}</span>
            </div>
            <b>Berlangsung</b>
          </article>
        ) : (
          <p className="empty-note">Belum ada sesi absensi yang berjalan untuk kelas {student.className}.</p>
        )}
      </section>
    </div>
  )
}

function History({ student }: P) {
  const db = useDB()
  const [month, setMonth] = useState(dateKey().slice(0, 7))
  const months = useMemo(() => {
    const set = new Set(db.attendance.filter((a) => a.studentId === student.id).map((a) => a.date.slice(0, 7)))
    set.add(dateKey().slice(0, 7))
    return [...set].sort().reverse()
  }, [db.attendance, student.id])
  const recs = db.attendance.filter((a) => a.studentId === student.id && a.date.slice(0, 7) === month)
  const t = tally(recs)
  const dates = [...new Set(recs.map((r) => r.date))].sort().reverse()
  const label = monthLabel(fromKey(month + "-01"))

  const exportCsv = () =>
    downloadCsv(`kehadiran-${student.nis}-${month}.csv`, [
      ["Tanggal", "Nama", "NIS", "Kelas", "Status", "Jam masuk"],
      ...dates.map((d) => {
        const r = dayRecord(db, student.id, d)
        return [d, student.name, student.nis, student.className, statusLabel[dayStatus(db, student.id, d) ?? "alpa"], r?.time ?? "—"]
      }),
    ])

  return (
    <div className="screen-content sub-screen">
      <header className="title-header">
        <p>AKTIVITAS SISWA</p>
        <h1>Riwayat kehadiran</h1>
      </header>
      <section className="month-summary">
        <div className="month-title">
          <span>{label}</span>
          <select aria-label="Pilih bulan" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(fromKey(m + "-01"))}</option>)}
          </select>
        </div>
        <div className="donut" style={{ background: `conic-gradient(var(--primary) ${t.rate}%, #e5eef0 0)` }}>
          <span><strong>{t.total ? `${t.rate}%` : "—"}</strong><small>hadir</small></span>
        </div>
        <div className="summary-numbers">
          <div><strong>{t.hadir}</strong><span>Hadir</span></div>
          <div><strong>{t.terlambat}</strong><span>Terlambat</span></div>
          <div><strong>{t.izin + t.sakit}</strong><span>Izin/Sakit</span></div>
        </div>
        <button className="report-export" onClick={exportCsv} disabled={!dates.length}>
          <Icon name="file" size={15} /> Unduh laporan bulanan (CSV)
        </button>
      </section>
      <section className="history-list">
        <div className="section-heading">
          <div><span>{dates.length} HARI TERCATAT</span><h2>Aktivitas</h2></div>
        </div>
        {dates.length === 0 && <p className="empty-note">Belum ada data kehadiran pada bulan ini.</p>}
        {dates.map((d) => {
          const s = dayStatus(db, student.id, d) as Status
          const r = dayRecord(db, student.id, d)
          return (
            <article key={d}>
              <div className="history-date"><strong>{fromKey(d).getDate()}</strong><span>{dayShort(d)}</span></div>
              <span className={`history-status ${statusTone(s)}`}><i /> {statusLabel[s]}</span>
              <div className="history-time"><strong>{r?.time ?? "—"}</strong><span>Jam masuk</span></div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

function Leave({ user, student }: P) {
  const db = useDB()
  const [type, setType] = useState<"izin" | "sakit">("izin")
  const [date, setDate] = useState(dateKey())
  const [reason, setReason] = useState("")
  const [file, setFile] = useState<{ name: string; data: string } | null>(null)
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)
  const mine = db.leaves.filter((l) => l.studentId === student.id)

  const pick = (f?: File) => {
    setError("")
    if (!f) return setFile(null)
    if (f.size > 400 * 1024) return setError("Lampiran maksimal 400 KB agar muat di penyimpanan perangkat.")
    const r = new FileReader()
    r.onload = () => setFile({ name: f.name, data: String(r.result) })
    r.readAsDataURL(f)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError("")
    if (mine.some((l) => l.date === date && l.status !== "rejected")) return setError("Sudah ada pengajuan untuk tanggal tersebut.")
    try {
      submitLeave({ studentId: student.id, parentId: user.id, type, date, reason: reason.trim(), proofName: file?.name, proofData: file?.data })
      setSent(true)
      setReason("")
      setFile(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="screen-content sub-screen">
      <header className="title-header">
        <p>PERMOHONAN KETIDAKHADIRAN</p>
        <h1>Ajukan izin</h1>
      </header>

      {sent ? (
        <section className="leave-success">
          <span><Icon name="check" size={25} /></span>
          <h2>Pengajuan berhasil dikirim</h2>
          <p>Wali kelas akan meninjau permohonan Anda. Status terbaru akan muncul di halaman ini.</p>
          <div><small>STATUS PENGAJUAN</small><strong><i /> Menunggu persetujuan</strong></div>
          <button onClick={() => setSent(false)}>Buat pengajuan lain</button>
        </section>
      ) : (
        <>
          <section className="leave-student">
            <div className="student-avatar small">{initials(student.name)}</div>
            <div>
              <span>Pengajuan untuk</span>
              <strong>{student.name}</strong>
              <small>{student.className} · NIS {student.nis}</small>
            </div>
          </section>

          <form className="leave-form" onSubmit={submit}>
            <label>Jenis ketidakhadiran</label>
            <div className="leave-types">
              <button type="button" className={type === "izin" ? "active" : ""} onClick={() => setType("izin")}>
                <Icon name="file" size={18} />
                <span><strong>Izin</strong><small>Keperluan keluarga</small></span>
              </button>
              <button type="button" className={type === "sakit" ? "active" : ""} onClick={() => setType("sakit")}>
                <Icon name="shield" size={18} />
                <span><strong>Sakit</strong><small>Kondisi kesehatan</small></span>
              </button>
            </div>

            <label htmlFor="leave-date">Tanggal tidak hadir</label>
            <div className="field-with-icon">
              <Icon name="calendar" size={17} />
              <input id="leave-date" type="date" min={dateKey()} value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>

            <label htmlFor="leave-reason">Keterangan</label>
            <textarea id="leave-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Jelaskan alasan ketidakhadiran..." required />

            <label>Bukti pendukung <span>(opsional)</span></label>
            <label className="upload-box">
              <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
              <span><Icon name="upload" size={19} /></span>
              <strong>{file ? file.name : "Unggah surat atau foto"}</strong>
              <small>JPG, PNG, atau PDF · Maks. 400 KB</small>
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="submit-leave" type="submit">Kirim pengajuan <Icon name="arrow" size={17} /></button>
          </form>
        </>
      )}

      <section className="previous-leave">
        <div><span>PENGAJUAN</span><h2>Riwayat izin</h2></div>
        {mine.length === 0 && <p className="empty-note">Belum ada pengajuan.</p>}
        {mine.map((l) => (
          <article key={l.id}>
            <span className="leave-date-box">
              <strong>{fromKey(l.date).getDate()}</strong>
              <small>{fromKey(l.date).toLocaleDateString("id-ID", { month: "short" }).toUpperCase()}</small>
            </span>
            <div>
              <strong>{l.type === "izin" ? "Izin" : "Sakit"} · {l.reason.slice(0, 28)}{l.reason.length > 28 ? "…" : ""}</strong>
              <small>{prettyDate(l.date)}</small>
            </div>
            <b className={`leave-${l.status}`}>{l.status === "pending" ? "Menunggu" : l.status === "approved" ? "Disetujui" : "Ditolak"}</b>
          </article>
        ))}
      </section>
    </div>
  )
}

function Alerts({ user }: { user: User }) {
  const db = useDB()
  const list = db.notices.filter((n) => n.userId === user.id)
  return (
    <div className="screen-content sub-screen">
      <header className="title-header">
        <p>PEMBARUAN REAL-TIME</p>
        <div className="title-row">
          <h1>Notifikasi</h1>
          <button onClick={() => markAllRead(user.id)}>Tandai dibaca</button>
        </div>
      </header>
      <div className="notification-list">
        {list.length === 0 && <p className="empty-note">Belum ada notifikasi.</p>}
        {list.map((n) => (
          <article className={n.type} key={n.id}>
            <span className="notification-icon"><Icon name={n.type === "success" ? "check" : n.type === "warning" ? "clock" : "bell"} size={17} /></span>
            <div><strong>{n.title}</strong><p>{n.text}</p><time>{ago(n.at)}</time></div>
            {!n.read && <i className="unread-dot" />}
          </article>
        ))}
      </div>
      <section className="notification-setting">
        <span><Icon name="shield" size={20} /></span>
        <div>
          <strong>Notifikasi otomatis aktif</strong>
          <p>Anda akan menerima kabar jika anak check-in, terlambat, atau tidak hadir.</p>
        </div>
      </section>
    </div>
  )
}

function Profile({ user, student }: P) {
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  return (
    <div className="screen-content sub-screen">
      <header className="title-header">
        <p>AKUN ORANG TUA</p>
        <h1>Profil & pengaturan</h1>
      </header>
      <section className="profile-card">
        <Avatar name={user.name} src={user.avatar} />
        <strong>{user.name}</strong>
        <span>Orang tua {student.name}</span>
        <small>{user.email}{user.provider ? ` · via ${user.provider === "google" ? "Google" : "Facebook"}` : ""}</small>
      </section>
      <section className="settings-card">
        {([
          ["user", "Data pribadi", user.phone ? `Foto, nama, email, ${user.phone}` : "Foto, nama, email, dan nomor telepon", "/ortu/akun/data"],
          ["bell", "Pengaturan notifikasi", "Panel notifikasi HP dan jenis kabar", "/ortu/akun/notifikasi"],
          ["shield", "Keamanan akun", "Perangkat masuk dan ganti password", "/ortu/akun/keamanan"],
        ] as const).map(([icon, title, copy, to]) => (
          <button key={to} onClick={() => navigate(to)}>
            <span><Icon name={icon} size={18} /></span>
            <div><strong>{title}</strong><small>{copy}</small></div>
            <Icon name="chevron" size={17} />
          </button>
        ))}
      </section>
      <button className="logout-button" type="button" onClick={() => setShowLogoutModal(true)}>
        <Icon name="logout" size={18} /> Keluar dari akun
      </button>
      <p className="version">Hadirku versi 1.0</p>

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
