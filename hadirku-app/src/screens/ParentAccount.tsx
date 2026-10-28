import { useRef, useState, type FormEvent } from "react"
import { Avatar } from "../components/Avatar"
import { Icon } from "../components/Icon"
import { Switch } from "../components/Switch"
import { navigate } from "../lib/router"
import { changePassword, defaultPrefs, deviceId, needsCurrentPassword, revokeDevice, revokeOthers, setPrefs, updateProfile, useDB } from "../lib/store"
import type { NotifPrefs, User } from "../lib/types"
import { ago } from "../lib/util"

const baseOf = (u: User) => (u.role === "teacher" ? "/guru/akun" : u.role === "student" ? "/siswa/akun" : "/ortu/akun")
const kickerOf = (u: User) => (u.role === "teacher" ? "AKUN GURU" : u.role === "student" ? "AKUN SISWA" : "AKUN ORANG TUA")

function Back({ title, user }: { title: string; user: User }) {
  return (
    <header className="title-header with-back">
      <button className="back-link" onClick={() => navigate(baseOf(user))} aria-label="Kembali ke profil">
        <Icon name="chevron" size={18} />
      </button>
      <div>
        <p>{kickerOf(user)}</p>
        <h1>{title}</h1>
      </div>
    </header>
  )
}

function resizeImage(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const c = document.createElement("canvas")
      c.width = c.height = size
      const side = Math.min(img.width, img.height)
      c.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL("image/jpeg", 0.85))
    }
    img.onerror = () => reject(new Error("File bukan gambar yang valid."))
    img.src = url
  })
}

export function PersonalData({ user }: { user: User }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [f, setF] = useState({ name: user.name, email: user.email, phone: user.phone ?? "" })
  const [avatar, setAvatar] = useState(user.avatar)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF({ ...f, [k]: e.target.value })
    setSaved(false)
  }
  const dirty = f.name !== user.name || f.email !== user.email || f.phone !== (user.phone ?? "") || avatar !== user.avatar

  const pick = async (file?: File) => {
    if (!file) return
    setError("")
    if (!file.type.startsWith("image/")) return setError("Pilih file gambar (JPG atau PNG).")
    try {
      setAvatar(await resizeImage(file))
      setSaved(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError("")
    try {
      updateProfile(user.id, { ...f, avatar })
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="screen-content sub-screen">
      <Back user={user} title="Data pribadi" />
      <section className="photo-card">
        <div className="photo-wrap">
          <Avatar name={f.name || user.name} src={avatar} className="photo-avatar" />
          <button type="button" className="photo-edit" aria-label="Ganti foto profil" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={15} />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = "" }} />
        <div className="photo-actions">
          <button type="button" onClick={() => fileRef.current?.click()}>Ganti foto</button>
          {avatar && <button type="button" className="danger" onClick={() => { setAvatar(undefined); setSaved(false) }}>Hapus</button>}
        </div>
        <small>Foto dipotong persegi otomatis dan disimpan di perangkat ini.</small>
      </section>

      <form className="link-form" onSubmit={submit}>
        <label>
          Nama lengkap
          <input required value={f.name} onChange={set("name")} autoComplete="name" />
        </label>
        <label>
          Email
          <input required type="email" value={f.email} onChange={set("email")} autoComplete="email" />
        </label>
        <label>
          Nomor telepon
          <input type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="Contoh: 0812 3456 7890" autoComplete="tel" />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {saved && <p className="form-ok" role="status"><Icon name="check" size={14} /> Perubahan tersimpan.</p>}
        <button className="primary-button" type="submit" disabled={!dirty}>
          Simpan perubahan <Icon name="arrow" size={18} />
        </button>
      </form>
    </div>
  )
}

const PARENT_ROWS: { key: keyof NotifPrefs; title: string; text: string }[] = [
  { key: "checkin", title: "Anak tiba di sekolah", text: "Saat check-in berhasil tercatat" },
  { key: "late", title: "Terlambat", text: "Saat anak check-in lewat batas waktu" },
  { key: "absent", title: "Tidak hadir", text: "Saat sesi ditutup tanpa check-in" },
  { key: "leave", title: "Status izin & sakit", text: "Saat guru menyetujui atau menolak" },
  { key: "session", title: "Sesi absensi dibuka", text: "Saat guru memulai absensi kelas" },
]

const TEACHER_ROWS: { key: keyof NotifPrefs; title: string; text: string }[] = [
  { key: "leave", title: "Pengajuan izin & sakit", text: "Saat orang tua mengirim pengajuan baru" },
  { key: "reminder", title: "Pengingat jadwal mengajar", text: "10 menit sebelum jam mengajar dimulai" },
]

const STUDENT_ROWS: { key: keyof NotifPrefs; title: string; text: string }[] = [
  { key: "session", title: "Sesi absensi dibuka", text: "Saat guru memulai absensi, saatnya scan QR" },
  { key: "checkin", title: "Status kehadiran diperbarui", text: "Saat guru mengubah catatan kehadiranmu" },
]

export function NotifSettings({ user }: { user: User }) {
  const teacher = user.role === "teacher"
  const student = user.role === "student"
  const ROWS = teacher ? TEACHER_ROWS : student ? STUDENT_ROWS : PARENT_ROWS
  const prefs: NotifPrefs = { ...defaultPrefs, ...user.prefs }
  const supported = typeof Notification !== "undefined"
  const [perm, setPerm] = useState(supported ? Notification.permission : "denied")
  const [msg, setMsg] = useState("")
  const save = (patch: Partial<NotifPrefs>) => setPrefs(user.id, { ...prefs, ...patch })

  const togglePush = async (on: boolean) => {
    setMsg("")
    if (!on) return save({ push: false })
    if (!supported) return setMsg("Browser ini tidak mendukung notifikasi sistem.")
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission()
    setPerm(p)
    if (p === "granted") save({ push: true })
    else setMsg("Izin notifikasi diblokir. Aktifkan lewat pengaturan situs di browser atau pengaturan aplikasi di HP, lalu coba lagi.")
  }

  const sample = teacher
    ? { title: "Pengingat mengajar: Pemrograman Web", text: "Kelas XI RPL 1 dimulai pukul 07.15. Buka sesi QR saat masuk kelas." }
    : student
    ? { title: "Sesi absensi dibuka", text: "Pemrograman Web untuk kelas XI RPL 1 dimulai pukul 07.15. Scan QR di layar guru." }
    : { title: "Nadia sudah tiba di sekolah", text: "Check-in tercatat pukul 07.05 untuk Pemrograman Web." }

  const test = () => {
    if (perm !== "granted") return setMsg("Izinkan notifikasi terlebih dahulu.")
    new Notification(sample.title, {
      body: prefs.preview ? sample.text : "Ada pembaruan baru dari Hadirku.",
      silent: !prefs.sound,
      tag: "hadirku-test",
    })
    setMsg("Notifikasi uji dikirim. Lihat di panel notifikasi perangkat Anda.")
  }

  return (
    <div className="screen-content sub-screen">
      <Back user={user} title="Pengaturan notifikasi" />

      <section className="push-card">
        <span className="push-icon"><Icon name="bell" size={20} /></span>
        <div>
          <strong>Notifikasi di panel HP</strong>
          <small>
            Tampil di bilah notifikasi saat aplikasi ditutup atau di latar belakang.
            {perm === "denied" && " (Izin diblokir)"}
          </small>
        </div>
        <Switch on={prefs.push && perm === "granted"} onChange={togglePush} label="Notifikasi di panel HP" />
      </section>

      {msg && <p className="form-note" role="status">{msg}</p>}

      <section className="lock-preview" aria-label="Pratinjau notifikasi">
        <small>PRATINJAU DI LAYAR KUNCI</small>
        <div className="lock-notif">
          <span className="lock-app"><Icon name="check" size={12} /></span>
          <div>
            <b>Hadirku <time>sekarang</time></b>
            <strong>{sample.title}</strong>
            <p>{prefs.preview ? sample.text : "Ada pembaruan baru dari Hadirku."}</p>
          </div>
        </div>
        <button type="button" onClick={test}>Kirim notifikasi uji</button>
      </section>

      <section className="settings-card pref-card">
        <p className="list-label">{teacher ? "KABARI SAYA TENTANG" : "KABARI SAYA TENTANG"}</p>
        {ROWS.map((r) => (
          <div className="pref-row" key={r.key}>
            <div><strong>{r.title}</strong><small>{r.text}</small></div>
            <Switch on={prefs[r.key] as boolean} onChange={(v) => save({ [r.key]: v })} label={r.title} />
          </div>
        ))}
      </section>

      <section className="settings-card pref-card">
        <p className="list-label">TAMPILAN & SUARA</p>
        <div className="pref-row">
          <div><strong>Tampilkan isi pesan</strong><small>Matikan agar layar kunci hanya menampilkan “pembaruan baru”</small></div>
          <Switch on={prefs.preview} onChange={(v) => save({ preview: v })} label="Tampilkan isi pesan" />
        </div>
        <div className="pref-row">
          <div><strong>Bunyi notifikasi</strong><small>Nonaktif = masuk secara senyap</small></div>
          <Switch on={prefs.sound} onChange={(v) => save({ sound: v })} label="Bunyi notifikasi" />
        </div>
        <div className="pref-row">
          <div><strong>Jangan ganggu</strong><small>Tahan notifikasi sistem pada jam istirahat</small></div>
          <Switch on={prefs.quiet} onChange={(v) => save({ quiet: v })} label="Jangan ganggu" />
        </div>
        {prefs.quiet && (
          <div className="quiet-times">
            <label>Mulai<input type="time" value={prefs.quietFrom} onChange={(e) => save({ quietFrom: e.target.value })} /></label>
            <label>Selesai<input type="time" value={prefs.quietTo} onChange={(e) => save({ quietTo: e.target.value })} /></label>
          </div>
        )}
      </section>
      <p className="link-hint"><Icon name="shield" size={13} />Notifikasi di dalam aplikasi tetap tercatat di halaman Notifikasi, apa pun pengaturan di atas.</p>
    </div>
  )
}

export function Security({ user }: { user: User }) {
  useDB()
  const me = deviceId()
  const devices = [...(user.devices ?? [])].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : b.lastActive - a.lastActive))
  const needCur = needsCurrentPassword(user)
  const [f, setF] = useState({ cur: "", next: "", again: "" })
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")
  const [ok, setOk] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF({ ...f, [k]: e.target.value })
    setOk(false)
  }
  const strength = (() => {
    const p = f.next
    let n = 0
    if (p.length >= 8) n++
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) n++
    if (/\d/.test(p)) n++
    if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) n++
    return p ? n : 0
  })()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError("")
    if (f.next !== f.again) return setError("Konfirmasi password tidak sama.")
    try {
      changePassword(user.id, f.cur, f.next)
      setF({ cur: "", next: "", again: "" })
      setOk(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="screen-content sub-screen">
      <Back user={user} title="Keamanan akun" />

      <section className="device-card">
        <div className="section-heading">
          <div><span>{devices.length} PERANGKAT</span><h2>Perangkat yang masuk</h2></div>
        </div>
        {devices.map((d) => (
          <article key={d.id}>
            <span className="device-icon"><Icon name={d.kind === "phone" ? "user" : "home"} size={18} /></span>
            <div>
              <strong>{d.name}{d.id === me && <em>Perangkat ini</em>}</strong>
              <small>{d.id === me ? "Aktif sekarang" : `Terakhir aktif ${ago(d.lastActive)}`} · masuk {ago(d.firstSeen)}</small>
            </div>
            {d.id !== me && (
              <button aria-label={`Keluarkan ${d.name}`} onClick={() => confirm(`Keluarkan ${d.name} dari akun?`) && revokeDevice(user.id, d.id)}>Keluarkan</button>
            )}
          </article>
        ))}
        {devices.length <= 1 && <p className="empty-note">Tidak ada perangkat lain yang sedang masuk.</p>}
        {devices.length > 1 && (
          <button className="revoke-all" onClick={() => confirm("Keluar dari semua perangkat lain?") && revokeOthers(user.id)}>
            Keluar dari semua perangkat lain
          </button>
        )}
      </section>

      <form className="link-form pw-form" onSubmit={submit}>
        <p className="link-section">{needCur ? "GANTI PASSWORD" : "BUAT PASSWORD"}</p>
        {!needCur && <p className="link-hint"><Icon name="shield" size={13} />Akun ini masuk lewat {user.provider === "google" ? "Google" : "Facebook"}. Buat password agar juga bisa masuk dengan email.</p>}
        {needCur && (
          <label>
            Password saat ini
            <input required type={show ? "text" : "password"} autoComplete="current-password" value={f.cur} onChange={set("cur")} />
          </label>
        )}
        <label>
          Password baru
          <input required minLength={8} type={show ? "text" : "password"} autoComplete="new-password" value={f.next} onChange={set("next")} placeholder="Minimal 8 karakter" />
        </label>
        <div className={`strength s${strength}`} aria-hidden="true"><i /><i /><i /><i /><span>{["", "Lemah", "Cukup", "Baik", "Kuat"][strength]}</span></div>
        <label>
          Ulangi password baru
          <input required type={show ? "text" : "password"} autoComplete="new-password" value={f.again} onChange={set("again")} />
        </label>
        <label className="agreement"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /><span>Tampilkan password</span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {ok && <p className="form-ok" role="status"><Icon name="check" size={14} /> Password diperbarui. Perangkat lain telah dikeluarkan.</p>}
        <button className="primary-button" type="submit">
          Perbarui password <Icon name="arrow" size={18} />
        </button>
      </form>
    </div>
  )
}
