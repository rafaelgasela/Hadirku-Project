import { useEffect, useState } from "react"
import { navigate, useRoute } from "./lib/router"
import { initAuth, logout, touchDevice, useUser } from "./lib/apiStore"
import { Auth, homeOf } from "./screens/Auth"
import { Checkin } from "./screens/Checkin"
import { Complete } from "./screens/Complete"
import { Parent } from "./screens/Parent"
import { Splash } from "./screens/Splash"
import { Student } from "./screens/Student"
import { Teacher } from "./screens/Teacher"
import { OAuthSuccess } from "./screens/OAuthSuccess"
import { DesktopHeader } from "./components/DesktopHeader"

const SPLASH = "hadirku:splash"

export default function App() {
  const route = useRoute()
  const user = useUser()
  const [splash, setSplash] = useState(() => !sessionStorage.getItem(SPLASH))
  const [ready, setReady] = useState(false)

  // Otomatis deteksi mode: Desktop (PC / Laptop >= 768px) atau Mobile (HP < 768px)
  const [isDesktop, setIsDesktop] = useState(() => {
    return typeof window !== "undefined" ? window.innerWidth >= 768 : false
  })

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Initialize auth from backend on mount
  useEffect(() => {
    initAuth().finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!splash) return
    const t = setTimeout(() => {
      sessionStorage.setItem(SPLASH, "1")
      setSplash(false)
    }, 1800)
    return () => clearTimeout(t)
  }, [splash])

  // Touch device on user load
  useEffect(() => {
    if (user) touchDevice(user.id).catch(() => {})
  }, [user?.id])

  useEffect(() => {
    if (!ready || splash) return
    const guest = ["/", "/masuk", "/daftar"].includes(route)
    if (route.startsWith("/checkin/") || route === "/lengkapi" || route === "/oauth-success") return
    if (!user && !guest) navigate("/masuk", true)
    else if (user && guest) navigate(homeOf(user.role), true)
    else if (!user && route === "/") navigate("/masuk", true)
    else if (user && !route.startsWith(homeOf(user.role))) navigate(homeOf(user.role), true)
  }, [route, user, splash, ready])

  if (!ready) return <div className="page"><main className="phone"><Splash /></main></div>

  let body
  if (splash) body = <Splash />
  else if (route === "/oauth-success") body = <OAuthSuccess />
  else if (route.startsWith("/checkin/")) body = <Checkin token={decodeURIComponent(route.slice(9))} />
  else if (route === "/lengkapi") body = <Complete />
  else if (!user) body = <Auth mode={route === "/daftar" ? "register" : "login"} />
  else if (route.startsWith("/ortu") && user.role === "parent") body = <Parent user={user as any} route={route} />
  else if (route.startsWith("/guru") && user.role === "teacher") body = <Teacher user={user as any} route={route} />
  else if (route.startsWith("/siswa") && user.role === "student") body = <Student user={user as any} route={route} />
  else body = null

  const showDesktop = isDesktop && !splash
  const isAuthRoute = !user && (route === "/" || route === "/masuk" || route === "/daftar")

  return (
    <div className={`page ${showDesktop ? "is-desktop-mode" : "is-mobile-mode"}`}>
      {showDesktop && (
        <DesktopHeader
          user={user as any}
          route={route}
          onLogout={() => {
            logout()
            sessionStorage.setItem("hadirku:logged_out", "1")
            navigate("/masuk?logged_out=1", true)
          }}
        />
      )}
      <main className={showDesktop ? (isAuthRoute ? "desktop-frame desktop-auth-frame" : "desktop-frame") : "phone"}>
        {body}
      </main>
    </div>
  )
}

