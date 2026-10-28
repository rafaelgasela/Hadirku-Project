import { useState, useEffect, type FormEvent } from "react"
import { Icon } from "../components/Icon"
import { GoogleLogo, FacebookLogo } from "../components/Social"
import { navigate } from "../lib/router"
import { registerParent, registerStudent, registerTeacher } from "../lib/apiStore"
import { apiLookupStudent } from "../lib/api"
import { clearPending, getPending, homeOf, type PendingSocial } from "./Auth"
import type { Role } from "../lib/types"

export function Complete() {
  const pending = getPending() || (() => {
    if (typeof window === "undefined") return null
    const searchParams = new URLSearchParams(window.location.search)
    const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : ""
    const hashParams = new URLSearchParams(hashQuery)

    const prov = (searchParams.get("provider") || hashParams.get("provider")) as "google" | "facebook" | null
    if (!prov) return null
    const result: PendingSocial = {
      provider: prov,
      email: searchParams.get("email") || hashParams.get("email") || "",
      name: searchParams.get("name") || hashParams.get("name") || "",
      role: ((searchParams.get("role") || hashParams.get("role")) as Role) || "parent",
      provider_id: searchParams.get("provider_id") || hashParams.get("provider_id") || undefined,
    }
    sessionStorage.setItem("hadirku:pending", JSON.stringify(result))
    return result
  })()

  const [role, setRole] = useState<Role>(() => pending?.role || "parent")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [lookup, setLookup] = useState<{ checked: boolean; found: boolean; name?: string; className?: string }>({
    checked: false,
    found: false,
  })

  const [f, setF] = useState({
    name: pending?.name ?? "",
    email: pending?.email ?? "",
    childName: "",
    nis: "",
    className: "XI RPL 1",
    phone: "",
    nip: "",
    subject: "",
    classes: "",
  })

  if (!pending) {
    navigate("/masuk", true)
    return null
  }

  const parent = role === "parent"
  const student = role === "student"
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const label = pending.provider === "google" ? "Google" : "Facebook"

  // Live lookup whenever NIS is typed
  useEffect(() => {
    const nis = f.nis.trim()
    if (!nis || nis.length < 3 || role === "teacher") {
      setLookup({ checked: false, found: false })
      return
    }
    const timer = setTimeout(() => {
      apiLookupStudent(nis)
        .then(res => {
          if (res.found && res.student) {
            setLookup({ checked: true, found: true, name: res.student.name, className: res.student.className })
            // Auto fill child name if parent and child name is still empty
            if (parent && !f.childName) {
              setF(prev => ({ ...prev, childName: res.student!.name, className: res.student!.className }))
            }
            if (student && res.student.className) {
              setF(prev => ({ ...prev, className: res.student!.className }))
            }
          } else {
            setLookup({ checked: true, found: false })
          }
        })
        .catch(() => setLookup({ checked: false, found: false }))
    }, 350)
    return () => clearTimeout(timer)
  }, [f.nis, role, parent, student])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setBusy(true)
    try {
      const socialPayload = {
        provider: pending.provider,
        providerId: pending.provider_id,
        className: f.className,
      }
      const user = student
        ? await registerStudent({ name: f.name, email: f.email, nis: f.nis, phone: f.phone, ...socialPayload })
        : parent
        ? await registerParent({ name: f.name, email: f.email, childName: f.childName, nis: f.nis, ...socialPayload })
        : await registerTeacher({ name: f.name, email: f.email, nip: f.nip, subject: f.subject, classes: f.classes, ...socialPayload })
      clearPending()
      navigate(homeOf(user.role), true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen-content link-screen no-nav">
      <header className="app-header">
        <div>
          <p>LANGKAH TERAKHIR</p>
          <h1>{student ? "Lengkapi profil siswa" : parent ? "Hubungkan data anak" : "Lengkapi profil guru"}</h1>
        </div>
      </header>

      <div className="link-steps">
        <span className="done"><Icon name="check" size={11} /></span>
        <i className="done" />
        <span className="current">2</span>
        <small>Akun terhubung</small>
        <small>{student ? "Data siswa" : parent ? "Data anak" : "Data guru"}</small>
      </div>

      <div className="link-account">
        <span className="link-g">{pending.provider === "google" ? <GoogleLogo size={16} /> : <FacebookLogo size={18} />}</span>
        <div>
          <strong>Berhasil masuk dengan {label}</strong>
          <small>{student ? "Lengkapi NIS & kelas agar kehadiranmu tercatat di sekolah." : parent ? "Lengkapi NIS & data anak agar Anda dapat memantau kehadiran siswa." : "Lengkapi data pengajaran agar jadwal dan absensi QR siap digunakan."}</small>
        </div>
      </div>

      <p className="role-label" style={{ marginTop: "1rem" }}>Daftar sebagai</p>
      <div className="role-selector" style={{ marginBottom: "1.25rem" }}>
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

      <form className="link-form" onSubmit={submit}>
        <p className="link-section">{student ? "DATA SISWA" : parent ? "DATA ORANG TUA" : "DATA GURU"}</p>
        <label>
          {student ? "Nama lengkap siswa" : parent ? "Nama lengkap orang tua" : "Nama lengkap guru"}
          <input required value={f.name} onChange={set("name")} />
        </label>
        <label>
          Email
          <input required type="email" value={f.email} onChange={set("email")} />
        </label>
        {student ? (
          <>
            <label>
              Nomor induk siswa (NIS)
              <input required inputMode="numeric" value={f.nis} onChange={set("nis")} placeholder="Contoh: 20250123" />
            </label>

            {lookup.checked && lookup.found && (
              <div style={{ background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", padding: "8px 12px", fontSize: "0.82rem", color: "#10b981", display: "flex", alignItems: "center", gap: "6px" }}>
                <Icon name="check" size={14} />
                <span>Terdaftar di database sekolah: <strong>{lookup.name}</strong> ({lookup.className})</span>
              </div>
            )}

            {lookup.checked && !lookup.found && f.nis.length >= 3 && (
              <div style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: "8px", padding: "8px 12px", fontSize: "0.82rem", color: "#3b82f6", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>✨ NIS baru — data Anda akan otomatis didaftarkan ke sistem sekolah.</span>
              </div>
            )}

            <label>
              Kelas
              <select value={f.className} onChange={set("className")}>
                <option value="XI RPL 1">XI RPL 1</option>
                <option value="XI RPL 2">XI RPL 2</option>
                <option value="X RPL 1">X RPL 1</option>
                <option value="X RPL 2">X RPL 2</option>
                <option value="XII RPL 1">XII RPL 1</option>
                <option value="XII RPL 2">XII RPL 2</option>
              </select>
            </label>

            <label>
              Nomor telepon (opsional)
              <input type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="Contoh: 0812 3456 7890" />
            </label>
            <p className="link-hint">
              <Icon name="shield" size={13} />
              Setelah ini kamu bisa scan QR absensi kelas secara real-time.
            </p>
          </>
        ) : parent ? (
          <>
            <p className="link-section">DATA ANAK</p>
            <label>
              Nomor induk siswa (NIS) anak
              <input required inputMode="numeric" value={f.nis} onChange={set("nis")} placeholder="Contoh: 20250123" />
            </label>

            {lookup.checked && lookup.found && (
              <div style={{ background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", padding: "8px 12px", fontSize: "0.82rem", color: "#10b981", display: "flex", alignItems: "center", gap: "6px" }}>
                <Icon name="check" size={14} />
                <span>Terdaftar di sekolah: <strong>{lookup.name}</strong> ({lookup.className})</span>
              </div>
            )}

            {lookup.checked && !lookup.found && f.nis.length >= 3 && (
              <div style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: "8px", padding: "8px 12px", fontSize: "0.82rem", color: "#3b82f6", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>✨ NIS baru — siswa akan otomatis didaftarkan ke sekolah di kelas {f.className}.</span>
              </div>
            )}

            <label>
              Nama lengkap anak
              <input required value={f.childName} onChange={set("childName")} placeholder="Contoh: Nadia Azzahra" />
            </label>

            <label>
              Kelas anak
              <select value={f.className} onChange={set("className")}>
                <option value="XI RPL 1">XI RPL 1</option>
                <option value="XI RPL 2">XI RPL 2</option>
                <option value="X RPL 1">X RPL 1</option>
                <option value="X RPL 2">X RPL 2</option>
                <option value="XII RPL 1">XII RPL 1</option>
                <option value="XII RPL 2">XII RPL 2</option>
              </select>
            </label>

            <p className="link-hint">
              <Icon name="shield" size={13} />
              NIS tertera di kartu pelajar atau buku rapor anak.
            </p>
          </>
        ) : (
          <>
            <label>
              NIP / ID guru
              <input required inputMode="numeric" value={f.nip} onChange={set("nip")} placeholder="Contoh: 198801152015041002" />
            </label>
            <p className="link-section">PENGAJARAN</p>
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
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Menyimpan data..." : "Simpan dan lanjutkan"}
        </button>
      </form>
    </div>
  )
}
