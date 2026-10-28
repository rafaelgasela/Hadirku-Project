import { useMemo, useState, type FormEvent } from "react"
import { Avatar } from "../components/Avatar"
import { PersonalData, NotifSettings, Security } from "./ParentAccount"
import { TeacherSchedule } from "./TeacherSchedule"
import { BottomNav } from "../components/Nav"
import { Icon } from "../components/Icon"
import { ConfirmLogoutModal } from "../components/ConfirmLogoutModal"
import { QrCode } from "../components/QrCode"
import { useNow } from "../components/Hooks"
import { navigate } from "../lib/router"
import {
  activeSession, addStudent, closeSession, dayStatus, decideLeave, getDB, logout, makeToken, markAllRead,
  markManual, openSession, removeStudent, studentsOf, tally, useDB, SLOT_MS,
} from "../lib/store"
import type { Session, Status, User } from "../lib/types"
import { ago, clock, dateKey, dayShort, downloadCsv, fromKey, greeting, initials, longDate, monthLabel, prettyDate, statusLabel, statusTone } from "../lib/util"

const NAV = [
  { path: "/guru", label: "Beranda", icon: "home" as const },
  { path: "/guru/qr", label: "Sesi QR", icon: "qr" as const },
  { path: "/guru/kelas", label: "Kelas", icon: "users" as const },
  { path: "/guru/laporan", label: "Laporan", icon: "file" as const },
  { path: "/guru/akun", label: "Akun", icon: "user" as const },
]

export function Teacher({ user, route }: { user: User; route: string }) {
  return (
    <>
      {route === "/guru/qr" ? <QrPage user={user} /> : route === "/guru/kelas" ? <Classes user={user} /> : route === "/guru/laporan" ? <Reports user={user} /> : route === "/guru/izin" ? <Leaves user={user} /> : route === "/guru/akun/data" ? <PersonalData user={user} /> : route === "/guru/akun/notifikasi" ? <NotifSettings user={user} /> : route === "/guru/akun/keamanan" ? <Security user={user} /> : route === "/guru/akun/jadwal" ? <TeacherSchedule user={user} /> : route === "/guru/akun" ? <Account user={user} /> : <Home user={user} />}
      <BottomNav items={NAV} route={route.startsWith("/guru/akun") ? "/guru/akun" : route} label="Navigasi guru" />
    </>
  )
}

const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5).replace(":", ".")

function sessionStats(session: Session) {
  const db = getDB()
  const students = studentsOf(db, session.className)
  const recs = db.attendance.filter((a) => a.sessionId === session.id)
  const by = new Map(recs.map((r) => [r.studentId, r.status]))
  return {
    students,
    by,
    hadir: recs.filter((r) => r.status === "hadir").length,
    terlambat: recs.filter((r) => r.status === "terlambat").length,
    izin: recs.filter((r) => r.status === "izin" || r.status === "sakit").length,
    scanned: recs.filter((r) => r.status === "hadir" || r.status === "terlambat").length,
    missing: students.filter((s) => !by.has(s.id)),
  }
}

function Home({ user }: { user: User }) {
  const db = useDB()
  const now = useNow(1000)
  const s = activeSession(db, user.id, now)
  const st = s ? sessionStats(s) : null
  const pending = db.leaves.filter((l) => l.status === "pending" && db.students.find((x) => x.id === l.studentId && user.classes?.includes(x.className))).length
  const unread = db.notices.filter((n) => n.userId === user.id && !n.read)
  const pct = st && st.students.length ? Math.round((st.scanned / st.students.length) * 100) : 0

  return (
    <div className="screen-content teacher-screen">
      <header className="app-header">
        <div>
          <p>{longDate().toUpperCase()}</p>
          <h1>{greeting()}, {user.name.split(/[ ,]/)[0]}</h1>
        </div>
        <button className="header-bell" aria-label="Notifikasi guru" onClick={() => { markAllRead(user.id); }}>
          <Icon name="bell" />
          {unread.length > 0 && <i />}
        </button>
      </header>

      <section className="teacher-class-card">
        <div className="teacher-class-head">
          <span className="class-icon"><Icon name="book" size={19} /></span>
          <div>
            <span>{s ? "KELAS BERLANGSUNG" : "BELUM ADA SESI"}</span>
            <strong>{s ? s.subject : user.subject}</strong>
            <small>{s ? `Kelas ${s.className}` : (user.classes ?? []).join(", ")}</small>
          </div>
          {s && <time>{hhmm(s.startedAt)}–{hhmm(s.endsAt)}</time>}
        </div>
        {s ? (
          <div className="qr-session">
            <QrCode value={qrUrl(s)} className="mini" />
            <div>
              <span className="live-session"><i /> SESI AKTIF</span>
              <strong>QR Absensi</strong>
              <small>Berakhir dalam {clock(s.endsAt - now)} menit</small>
              <button onClick={() => navigate("/guru/qr")}>Tampilkan QR</button>
            </div>
          </div>
        ) : (
          <button className="open-session" onClick={() => navigate("/guru/qr")}>
            <Icon name="qr" size={19} /> Buka sesi QR baru
          </button>
        )}
      </section>

      {st && (
        <>
          <section className="teacher-stats">
            <article><strong>{st.scanned}</strong><span>Hadir</span><small>dari {st.students.length} siswa</small></article>
            <article><strong>{String(st.terlambat).padStart(2, "0")}</strong><span>Terlambat</span><small>tercatat</small></article>
            <article><strong>{String(st.missing.length).padStart(2, "0")}</strong><span>Belum hadir</span><small>belum scan</small></article>
          </section>
          <section className="teacher-progress">
            <div><span>Progres absensi kelas</span><strong>{pct}%</strong></div>
            <div className="teacher-track"><i style={{ width: `${pct}%` }} /></div>
            <small>{st.scanned} siswa telah melakukan scan QR</small>
          </section>
          <section className="content-section teacher-followup">
            <div className="section-heading">
              <div><span>PERLU TINDAKAN</span><h2>Belum check-in</h2></div>
              <button onClick={() => navigate("/guru/qr")}>Kelola <Icon name="chevron" size={14} /></button>
            </div>
            {st.missing.length === 0 && <p className="empty-note">Semua siswa sudah tercatat.</p>}
            {st.missing.slice(0, 5).map((m) => (
              <article key={m.id}>
                <div className="mini-student">{initials(m.name)}</div>
                <div><strong>{m.name}</strong><span>Belum hadir · tanpa keterangan</span></div>
                <button onClick={() => markManual(s!.id, m.id, "hadir")}>Tandai hadir</button>
              </article>
            ))}
          </section>
        </>
      )}

      <button className="leave-review-card" onClick={() => navigate("/guru/izin")}>
        <span><Icon name="file" size={19} /></span>
        <div>
          <strong>{pending ? `${pending} pengajuan perlu ditinjau` : "Tidak ada pengajuan baru"}</strong>
          <small>Izin dan sakit dari kelas Anda</small>
        </div>
        <Icon name="chevron" size={17} />
      </button>
    </div>
  )
}

const qrUrl = (s: Session) => `${location.origin}${location.pathname}#/checkin/${makeToken(s)}`

function QrPage({ user }: { user: User }) {
  const db = useDB()
  const now = useNow(1000)
  const s = activeSession(db, user.id, now)
  const [cls, setCls] = useState(user.classes?.[0] ?? "")
  const [subject, setSubject] = useState(user.subject ?? "")
  const [minutes, setMinutes] = useState(90)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  const open = (e: FormEvent) => {
    e.preventDefault()
    try {
      openSession(user.id, cls, subject, minutes)
      setError("")
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (!s)
    return (
      <div className="screen-content sub-screen teacher-detail">
        <header className="title-header"><p>ABSENSI DIGITAL</p><h1>Buka sesi QR</h1></header>
        <form className="leave-form" onSubmit={open}>
          <label htmlFor="cls">Kelas</label>
          <select id="cls" value={cls} onChange={(e) => setCls(e.target.value)}>
            {(user.classes ?? []).map((c) => <option key={c}>{c}</option>)}
          </select>
          <label htmlFor="subj">Mata pelajaran</label>
          <input id="subj" className="plain-input" required value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label htmlFor="dur">Durasi sesi</label>
          <select id="dur" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[10, 45, 90, 135].map((m) => <option key={m} value={m}>{m} menit</option>)}
          </select>
          <p className="link-hint"><Icon name="shield" size={13} />Siswa terhitung terlambat setelah 15 menit. QR berganti otomatis tiap 30 detik agar tidak bisa dibagikan.</p>
          {error && <p className="form-error">{error}</p>}
          <button className="submit-leave" type="submit"><Icon name="qr" size={17} /> Mulai sesi absensi</button>
        </form>
      </div>
    )

  const st = sessionStats(s)
  const url = qrUrl(s)
  const slotLeft = SLOT_MS - (now % SLOT_MS)
  const pct = st.students.length ? Math.round((st.scanned / st.students.length) * 100) : 0

  return (
    <div className="screen-content sub-screen teacher-detail">
      <header className="title-header"><p>ABSENSI DIGITAL</p><h1>Sesi QR kelas</h1></header>
      <section className="qr-focus-card">
        <span className="live-session dark"><i /> SESI AKTIF</span>
        <h2>{s.subject}</h2>
        <p>Kelas {s.className} · {hhmm(s.startedAt)}–{hhmm(s.endsAt)}</p>
        <QrCode value={url} className="large" />
        <strong className="qr-countdown">{clock(s.endsAt - now)}</strong>
        <small>QR diperbarui otomatis dalam {Math.ceil(slotLeft / 1000)} detik</small>
        <div className="qr-actions">
          <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
            {copied ? "Tersalin" : "Salin tautan"}
          </button>
          <a href={url} target="_blank" rel="noreferrer">Buka check-in</a>
        </div>
        <button onClick={() => { if (confirm("Tutup sesi? Siswa yang belum scan akan dicatat tidak hadir.")) closeSession(s.id) }}>
          Tutup sesi absensi
        </button>
      </section>

      <section className="scan-summary">
        <div><strong>{st.scanned}/{st.students.length}</strong><span>Siswa sudah scan</span></div>
        <div className="teacher-track"><i style={{ width: `${pct}%` }} /></div>
      </section>

      <section className="roster">
        {st.students.map((m) => {
          const status = st.by.get(m.id)
          return (
            <article key={m.id}>
              <div className={`mini-student ${status ? "ok" : ""}`}>{initials(m.name)}</div>
              <div>
                <strong>{m.name}</strong>
                <span className={`tag ${statusTone(status)}`}>{status ? statusLabel[status] : "Belum scan"}</span>
              </div>
              <div className="roster-actions">
                {(["hadir", "izin", "sakit"] as Status[]).map((x) => (
                  <button key={x} className={status === x ? "on" : ""} onClick={() => markManual(s.id, m.id, x)} aria-label={`${m.name} ${x}`}>
                    {x === "hadir" ? "H" : x === "izin" ? "I" : "S"}
                  </button>
                ))}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

function Classes({ user }: { user: User }) {
  const db = useDB()
  const [open, setOpen] = useState<string | null>(null)
  const [nis, setNis] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const today = dateKey()

  const add = (e: FormEvent, className: string) => {
    e.preventDefault()
    try {
      addStudent(className, nis, name)
      setNis("")
      setName("")
      setError("")
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="screen-content sub-screen teacher-detail">
      <header className="title-header"><p>TAHUN AJARAN {new Date().getFullYear()}/{new Date().getFullYear() + 1}</p><h1>Kelas yang diampu</h1></header>
      <section className="teacher-class-list">
        {(user.classes ?? []).map((c, i) => {
          const students = studentsOf(db, c)
          const t = tally(db.attendance.filter((a) => students.some((s) => s.id === a.studentId)))
          return (
            <div key={c}>
              <article onClick={() => setOpen(open === c ? null : c)} role="button" tabIndex={0}>
                <span className={`class-avatar class-${i % 3}`}>{c.split(" ").slice(-1)[0]}</span>
                <div><strong>{c}</strong><span>{students.length} siswa</span></div>
                <b>{t.total ? `${t.rate}%` : "—"}</b>
                <Icon name={open === c ? "close" : "chevron"} size={16} />
              </article>
              {open === c && (
                <div className="class-detail">
                  {students.length === 0 && <p className="empty-note">Belum ada siswa.</p>}
                  {students.map((m) => {
                    const s = dayStatus(db, m.id, today)
                    const mt = tally(db.attendance.filter((a) => a.studentId === m.id))
                    return (
                      <div className="class-row" key={m.id}>
                        <div className="mini-student ok">{initials(m.name)}</div>
                        <div><strong>{m.name}</strong><span>NIS {m.nis} · {mt.total ? `${mt.rate}% hadir` : "belum ada data"}</span></div>
                        <span className={`tag ${statusTone(s)}`}>{s ? statusLabel[s] : "—"}</span>
                        <button aria-label={`Hapus ${m.name}`} onClick={() => confirm(`Hapus ${m.name} dari kelas?`) && removeStudent(m.id)}><Icon name="close" size={14} /></button>
                      </div>
                    )
                  })}
                  <form className="add-student" onSubmit={(e) => add(e, c)}>
                    <input required inputMode="numeric" placeholder="NIS" value={nis} onChange={(e) => setNis(e.target.value)} />
                    <input required placeholder="Nama siswa" value={name} onChange={(e) => setName(e.target.value)} />
                    <button type="submit">Tambah</button>
                  </form>
                  {error && <p className="form-error">{error}</p>}
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

function Reports({ user }: { user: User }) {
  const db = useDB()
  const classes = user.classes ?? []
  const [cls, setCls] = useState(classes[0] ?? "")
  const students = studentsOf(db, cls)
  const ids = new Set(students.map((s) => s.id))
  const recs = db.attendance.filter((a) => ids.has(a.studentId))
  const t = tally(recs)
  const days = useMemo(() => [...new Set(recs.map((r) => r.date))].sort().slice(-7), [recs])
  const bars = days.map((d) => tally(recs.filter((r) => r.date === d)).rate)
  const month = dateKey().slice(0, 7)
  const nameOf = (id: string) => db.students.find((s) => s.id === id)

  const rekap = () =>
    downloadCsv(`rekap-${cls.replace(/\s/g, "")}-${month}.csv`, [
      ["NIS", "Nama", "Kelas", "Hadir", "Terlambat", "Izin", "Sakit", "Tidak hadir", "% Hadir"],
      ...students.map((s) => {
        const x = tally(db.attendance.filter((a) => a.studentId === s.id && a.date.startsWith(month)))
        return [s.nis, s.name, s.className, x.hadir, x.terlambat, x.izin, x.sakit, x.alpa, x.rate]
      }),
    ])
  const harian = () =>
    downloadCsv(`kehadiran-harian-${cls.replace(/\s/g, "")}.csv`, [
      ["Tanggal", "NIS", "Nama", "Status", "Jam"],
      ...recs.sort((a, b) => a.date.localeCompare(b.date)).map((r) => [r.date, nameOf(r.studentId)?.nis ?? "", nameOf(r.studentId)?.name ?? "", statusLabel[r.status], r.time]),
    ])
  const telat = () =>
    downloadCsv(`keterlambatan-${cls.replace(/\s/g, "")}.csv`, [
      ["Tanggal", "NIS", "Nama", "Jam datang"],
      ...recs.filter((r) => r.status === "terlambat").map((r) => [r.date, nameOf(r.studentId)?.nis ?? "", nameOf(r.studentId)?.name ?? "", r.time]),
    ])

  return (
    <div className="screen-content sub-screen teacher-detail">
      <header className="title-header"><p>REKAP & ANALITIK</p><h1>Laporan kehadiran</h1></header>
      <select className="class-pick" aria-label="Pilih kelas" value={cls} onChange={(e) => setCls(e.target.value)}>
        {classes.map((c) => <option key={c}>{c}</option>)}
      </select>
      <section className="report-hero">
        <span>RATA-RATA KEHADIRAN</span>
        <strong>{t.total ? `${t.rate}%` : "—"}</strong>
        <small>{t.total ? `${t.hadir} hadir · ${t.terlambat} terlambat · ${t.izin + t.sakit} izin/sakit · ${t.alpa} alpa` : "Belum ada data"}</small>
        <div className="report-bars">
          {bars.map((h, i) => <i key={days[i]} style={{ height: `${Math.max(h, 6)}%` }} title={`${dayShort(days[i])} ${h}%`} />)}
        </div>
        <div className="bar-days">{days.map((d) => <span key={d}>{fromKey(d).getDate()}</span>)}</div>
      </section>
      <section className="report-options">
        <h2>Unduh laporan (CSV)</h2>
        {[
          ["Rekap bulanan", `${monthLabel()} · ${cls}`, rekap],
          ["Kehadiran harian", `Semua tanggal · ${cls}`, harian],
          ["Laporan keterlambatan", `Semua tanggal · ${cls}`, telat],
        ].map(([a, b, fn]) => (
          <button key={a as string} onClick={fn as () => void} disabled={!students.length}>
            <span><Icon name="file" size={17} /></span>
            <div><strong>{a as string}</strong><small>{b as string}</small></div>
            <Icon name="arrow" size={15} />
          </button>
        ))}
      </section>
    </div>
  )
}

function Leaves({ user }: { user: User }) {
  const db = useDB()
  const [tab, setTab] = useState<"pending" | "all">("pending")
  const [view, setView] = useState<{ src: string; name?: string } | null>(null)
  const all = db.leaves.filter((l) => db.students.find((s) => s.id === l.studentId && user.classes?.includes(s.className)))
  const pending = all.filter((l) => l.status === "pending").length
  const list = tab === "pending" ? all.filter((l) => l.status === "pending") : all
  return (
    <div className="screen-content sub-screen teacher-detail">
      <header className="title-header"><p>TINJAUAN</p><h1>Pengajuan izin</h1></header>
      <div className="leave-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "pending"} className={tab === "pending" ? "on" : ""} onClick={() => setTab("pending")}>Menunggu{pending > 0 && <em>{pending}</em>}</button>
        <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>Semua</button>
      </div>
      <section className="leave-list">
        {list.length === 0 && <p className="empty-note">{tab === "pending" ? "Tidak ada pengajuan yang menunggu." : "Belum ada pengajuan."}</p>}
        {list.map((l) => {
          const s = db.students.find((x) => x.id === l.studentId)!
          return (
            <article key={l.id}>
              <div className="leave-top">
                <div className="mini-student ok">{initials(s.name)}</div>
                <div><strong>{s.name}</strong><span>{s.className} · {l.type === "izin" ? "Izin" : "Sakit"} · {prettyDate(l.date)}</span></div>
              </div>
              <p>{l.reason}</p>
              {l.proofData && l.proofData.startsWith("data:image") && (
                <button className="proof-thumb" onClick={() => setView({ src: l.proofData!, name: l.proofName })} aria-label="Lihat gambar bukti">
                  <img src={l.proofData} alt={l.proofName ?? "Bukti"} />
                  <span><Icon name="eye" size={14} /> Lihat bukti</span>
                </button>
              )}
              {l.proofData && !l.proofData.startsWith("data:image") && <a href={l.proofData} download={l.proofName} className="proof-link"><Icon name="file" size={14} /> {l.proofName}</a>}
              <small>Diajukan {ago(l.createdAt)}</small>
              {l.status === "pending" ? (
                <div className="leave-actions">
                  <button onClick={() => decideLeave(l.id, "rejected")}>Tolak</button>
                  <button className="yes" onClick={() => decideLeave(l.id, "approved")}>Setujui</button>
                </div>
              ) : (
                <b className={`leave-${l.status}`}>{l.status === "approved" ? "Disetujui" : "Ditolak"}</b>
              )}
            </article>
          )
        })}
      </section>
      {view && (
        <div className="proof-viewer" role="dialog" aria-label="Bukti pengajuan" onClick={() => setView(null)}>
          <button aria-label="Tutup" onClick={() => setView(null)}><Icon name="close" size={18} /></button>
          <img src={view.src} alt={view.name ?? "Bukti"} onClick={(e) => e.stopPropagation()} />
          {view.name && <p>{view.name}</p>}
          <a href={view.src} download={view.name} onClick={(e) => e.stopPropagation()}>Unduh gambar</a>
        </div>
      )}
    </div>
  )
}

function Account({ user }: { user: User }) {
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  return (
    <div className="screen-content sub-screen teacher-detail">
      <header className="title-header"><p>AKUN GURU</p><h1>Profil & pengaturan</h1></header>
      <section className="profile-card">
        <Avatar name={user.name} src={user.avatar} />
        <strong>{user.name}</strong>
        <span>{user.subject} · {(user.classes ?? []).join(", ")}</span>
        <small>NIP {user.nip}</small>
      </section>
      <section className="settings-card">
        {([
          ["user", "Data pribadi", user.phone ? `Foto, nama, email, ${user.phone}` : "Foto, nama, email, dan nomor telepon", "/guru/akun/data"],
          ["calendar", "Jadwal mengajar", `${(user.schedule ?? []).length} sesi per minggu`, "/guru/akun/jadwal"],
          ["bell", "Pengaturan notifikasi", "Panel notifikasi HP, izin, dan pengingat mengajar", "/guru/akun/notifikasi"],
          ["shield", "Keamanan akun", "Perangkat masuk dan ganti password", "/guru/akun/keamanan"],
        ] as const).map(([icon, title, copy, to]) => (
          <button key={to} onClick={() => navigate(to)}>
            <span><Icon name={icon} size={18} /></span>
            <div><strong>{title}</strong><small>{copy}</small></div>
            <Icon name="chevron" size={17} />
          </button>
        ))}
        <button onClick={() => navigate("/guru/izin")}>
          <span><Icon name="file" size={18} /></span>
          <div><strong>Pengajuan izin</strong><small>Tinjau izin dan sakit dari orang tua</small></div>
          <Icon name="chevron" size={17} />
        </button>
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
