import { useEffect, useState } from "react"
import { navigate } from "../lib/router"
import { loginWithToken } from "../lib/apiStore"
import { homeOf } from "./Auth"

export function OAuthSuccess() {
  const [error, setError] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "")

    // Check both query string and hash
    const token = params.get("token") || hashParams.get("token")
    const role = params.get("role") || hashParams.get("role")
    const err = params.get("error") || hashParams.get("error")

    if (err) {
      setError(decodeURIComponent(err))
      setTimeout(() => navigate("/masuk", true), 3000)
      return
    }

    if (token && role) {
      loginWithToken(token)
        .then(user => navigate(homeOf(user.role), true))
        .catch(e => {
          setError(e.message)
          setTimeout(() => navigate("/masuk", true), 3000)
        })
    } else {
      navigate("/masuk", true)
    }
  }, [])

  if (error) {
    return (
      <div className="splash-screen">
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p className="form-error">{error}</p>
          <small>Mengalihkan ke halaman masuk...</small>
        </div>
      </div>
    )
  }

  return (
    <div className="splash-screen">
      <div className="splash-logo">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <p>Memproses login...</p>
    </div>
  )
}
