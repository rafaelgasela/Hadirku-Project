import { useState, useEffect, type FormEvent } from "react"
import { Brand } from "../components/Brand"
import { Icon } from "../components/Icon"
import { FacebookLogo, GoogleLogo } from "../components/Social"
import { navigate } from "../lib/router"
import { login, registerParent, registerStudent, registerTeacher } from "../lib/apiStore"
import { apiGetProviders, googleLoginUrl, facebookLoginUrl } from "../lib/api"
import type { Role } from "../lib/types"
import type { ApiUser } from "../lib/api"

export const homeOf = (role: string) =>
  role === "parent" ? "/ortu" : role === "teacher" ? "/guru" : "/siswa"

export interface PendingSocial { provider: "google" | "facebook"; email: string; name: string; role: Role; provider_id?: string }
const PENDING = "hadirku:pending"
export const getPending = (): PendingSocial | null => {
  try { return JSON.parse(sessionStorage.getItem(PENDING) || "null") } catch { return null }
}
export const clearPending = () => sessionStorage.removeItem(PENDING)

export function Auth({ mode }: { mode: "login" | "register" }) {
  const [role, setRole] = useState<Role>("parent")
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [providers, setProviders] = useState({ google: false, facebook: false })
  const [loggedOut, setLoggedOut] = useState(false)
  const [f, setF] = useState({ name: "", email: "", password: "", childName: "", nis: "", className: "XI RPL 1", nip: "", subject: "", classes: "" })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const isLogin = mode === "login"

  useEffect(() => {
    // Check which OAuth providers are configured
    apiGetProviders().then(setProviders).catch(() => {})

    // Check for error from OAuth redirect (search or hash)
    const searchParams = new URLSearchParams(window.location.search)
    const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : ""
    const hashParams = new URLSearchParams(hashQuery)

    const wasLoggedOut = searchParams.get("logged_out") === "1" || hashParams.get("logged_out") === "1" || sessionStorage.getItem("hadirku:logged_out") === "1"
    if (wasLoggedOut) {
      setLoggedOut(true)
      sessionStorage.removeItem("hadirku:logged_out")
    }

    const err = searchParams.get("error") || hashParams.get("error")
    if (err) setError(decodeURIComponent(err))

    // Check for pending social from URL
    const prov = (searchParams.get("provider") || hashParams.get("provider")) as "google" | "facebook" | null
    if (prov) {
      const pending: PendingSocial = {
        provider: prov,
        email: searchParams.get("email") || hashParams.get("email") || "",
        name: searchParams.get("name") || hashParams.get("name") || "",
        role: ((searchParams.get("role") || hashParams.get("role")) as Role) || "parent",
        provider_id: searchParams.get("provider_id") || hashParams.get("provider_id") || undefined,
      }
      sessionStorage.setItem(PENDING, JSON.stringify(pending))
      navigate("/lengkapi")
    }
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setBusy(true)
    try {
      let user: ApiUser
      if (isLogin) {
        user = await login(f.email, f.password, role)
      } else if (role === "student") {
        user = await registerStudent({ name: f.name, email: f.email, password: f.password, nis: f.nis, className: f.className })
      } else if (role === "parent") {
        user = await registerParent({ name: f.name, email: f.email, password: f.password, childName: f.childName, nis: f.nis, className: f.className })
      } else {
        user = await registerTeacher({ name: f.name, email: f.email, password: f.password, nip: f.nip, subject: f.subject, classes: f.classes })
      }
      navigate(homeOf(user.role), true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleSocialLogin = (provider: "google" | "facebook") => {
    if (!providers.google && provider === "google") {
      setError("Login Google belum dikonfigurasi di server. Masukkan GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET pada file .env server.")
      return
    }
    if (!providers.facebook && provider === "facebook") {
      setError("Login Facebook belum dikonfigurasi di server. Masukkan FACEBOOK_APP_ID & FACEBOOK_APP_SECRET pada file .env server.")
      return
    }
    const url = provider === "google" ? googleLoginUrl(role) : facebookLoginUrl(role)
    window.location.href = url
  }

  return (
    <div className="auth-screen">
      <div className="auth-hero">
        <header className="auth-header">
          <span className="secure-label">
            <Icon name="shield" size={13} /> Aman &amp; terenkripsi
          </span>
        </header>
        <section className="auth-intro">
          <Brand />
          <p>{role === "parent" ? "PORTAL ORANG TUA" : role === "teacher" ? "PORTAL GURU" : "PORTAL SISWA"}</p>
          <h1>
            {role === "student"
              ? isLogin ? "Scan QR kelas, kehadiran langsung tercatat." : "Buat akun siswa untuk absen dengan sekali scan."
              : role === "parent"
              ? isLogin ? "Sekolah dekat, meski Anda tidak di sana." : "Terhubung dengan sekolah dalam satu langkah."
              : isLogin ? "Absensi kelas, selesai dalam sekali scan." : "Siapkan kelas dan mulai sesi QR pertama Anda."}
          </h1>
          <span>
            {role === "student" ? "Orang tua otomatis mendapat kabar setiap kali kamu check-in."
              : role === "parent" ? "Informasi sekolah yang akurat, langsung dalam genggaman Anda."
              : "Pantau kehadiran siswa secara real-time dan tinjau pengajuan izin."}
          </span>
          <div className="auth-proof">
            <span className="proof-icon"><Icon name="check" size={15} /></span>
            <div><strong>Absensi terverifikasi</strong><small>Terpantau secara real-time</small></div>
          </div>
        </section>
      </div>

      <section className="auth-card">
        {loggedOut && (
          <div className="relogin-banner">
            <div className="relogin-banner-header">
              <span className="relogin-icon">👋</span>
              <div>
                <strong>Anda telah keluar dari akun</strong>
                <p>Silakan pilih peran dan masuk kembali menggunakan akun Google Anda.</p>
              </div>
            </div>
            <button
              type="button"
              className="relogin-google-btn"
              onClick={() => handleSocialLogin("google")}
            >
              <GoogleLogo size={18} />
              <span>Masuk Ulang dengan Google</span>
            </button>
          </div>
        )}

        <div className="form-heading">
          <strong>{isLogin ? "Selamat datang kembali" : "Buat akun baru"}</strong>
          <span>{isLogin ? "Masuk untuk melanjutkan." : "Daftar sebagai siswa, orang tua, atau guru."}</span>
        </div>

        <p className="role-label">{isLogin ? "Masuk sebagai" : "Daftar sebagai"}</p>
        <div className="role-selector">
          <button type="button" className={role === "student" ? "active" : ""} onClick={() => setRole("student")}>
            <Icon name="qr" size={16} /> Siswa
          </button>
          <button type="button" className={role === "parent" ? "active" : ""} onClick={() => setRole("parent")}>
            <Icon name="user" size={16} /> Orang tua
          </button>
          <button type="button" className={role === "teacher" ? "active" : ""} onClick={() => setRole("teacher")}>
            <Icon name="book" size={16} /> Guru
          </button>
        </div>

        <div className="auth-tabs">
          <button type="button" className={isLogin ? "active" : ""} onClick={() => navigate("/masuk")}>Masuk</button>
          <button type="button" className={!isLogin ? "active" : ""} onClick={() => navigate("/daftar")}>Daftar</button>
        </div>

        <form onSubmit={submit}>
          {!isLogin && (
            <label>
              {role === "student" ? "Nama lengkap siswa" : role === "parent" ? "Nama lengkap orang tua" : "Nama lengkap guru"}
              <input required value={f.name} onChange={set("name")}
                placeholder={role === "student" ? "Sesuai kartu pelajar" : role === "parent" ? "Contoh: Rina Andriani" : "Contoh: Dimas Pratama, S.Kom"} />
            </label>
          )}
          {!isLogin && role === "student" && (
            <label>
              Nomor induk siswa (NIS)
              <input required inputMode="numeric" value={f.nis} onChange={set("nis")} placeholder="Contoh: 20250123" />
            </label>
          )}
          <label>
            Email
            <input required type="email" autoComplete="email" value={f.email} onChange={set("email")} placeholder="nama@email.com" />
          </label>
          {!isLogin && role === "parent" && (
            <>
              <label>
                Nama lengkap anak
                <input required value={f.childName} onChange={set("childName")} placeholder="Sesuai kartu pelajar" />
              </label>
              <label>
                Nomor induk siswa (NIS)
                <input required inputMode="numeric" value={f.nis} onChange={set("nis")} placeholder="Contoh: 20250123" />
              </label>
            </>
          )}
          {!isLogin && role === "teacher" && (
            <>
              <label>
                NIP / ID guru
                <input required inputMode="numeric" value={f.nip} onChange={set("nip")} placeholder="Contoh: 198801152015041002" />
              </label>
              <label>
                Mata pelajaran
                <input required value={f.subject} onChange={set("subject")} placeholder="Contoh: Pemrograman Web" />
              </label>
              <label>
                Kelas yang diampu
                <input required value={f.classes} onChange={set("classes")} placeholder="Contoh: XI RPL 1, XI RPL 2" />
              </label>
            </>
          )}
          <label>
            Password
            <span className="password-field">
              <input
                required
                minLength={isLogin ? undefined : 8}
                type={show ? "text" : "password"}
                autoComplete={isLogin ? "current-password" : "new-password"}
                value={f.password}
                onChange={set("password")}
                placeholder="Minimal 8 karakter"
              />
              <button type="button" aria-label="Tampilkan password" onClick={() => setShow(!show)}>
                <Icon name="eye" size={18} />
              </button>
            </span>
          </label>
          {!isLogin && (
            <label className="agreement">
              <input type="checkbox" required />
              <span>Saya menyetujui Syarat Penggunaan dan Kebijakan Privasi.</span>
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Memproses..." : isLogin ? "Masuk ke akun" : role === "student" ? "Buat akun siswa" : role === "parent" ? "Buat akun orang tua" : "Buat akun guru"}
            {!busy && <Icon name="arrow" size={18} />}
          </button>
        </form>

        <>
          <div className="separator"><span>atau lanjutkan dengan</span></div>
          <div className="social-row">
            <button
              type="button"
              aria-label="Masuk dengan Google"
              onClick={() => handleSocialLogin("google")}
              title={providers.google ? "Login dengan Google" : "Google OAuth belum dikonfigurasi"}
            >
              <GoogleLogo />
              <span className="social-text">Google</span>
              {!providers.google && <span className="oauth-badge">?</span>}
            </button>
            <button
              type="button"
              aria-label="Masuk dengan Facebook"
              onClick={() => handleSocialLogin("facebook")}
              title={providers.facebook ? "Login dengan Facebook" : "Facebook OAuth belum dikonfigurasi"}
            >
              <FacebookLogo />
              <span className="social-text">Facebook</span>
              {!providers.facebook && <span className="oauth-badge">?</span>}
            </button>
          </div>
          {(!providers.google || !providers.facebook) && (
            <p className="oauth-hint">
              <Icon name="shield" size={11} /> Untuk mengaktifkan login Google/Facebook, isi kredensial OAuth di file .env server.
            </p>
          )}
        </>
      </section>
      <p className="auth-footer">Terhubung aman dengan sistem sekolah</p>
    </div>
  )
}
