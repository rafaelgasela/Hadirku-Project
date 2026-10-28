import { useSyncExternalStore } from "react"

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb)
  window.addEventListener("popstate", cb)
  return () => {
    window.removeEventListener("hashchange", cb)
    window.removeEventListener("popstate", cb)
  }
}

export const readRoute = (): string => {
  if (typeof window === "undefined") return "/"

  // 1. Check hash first: e.g. #/lengkapi?provider=google or #/masuk
  const hash = window.location.hash.replace(/^#/, "")
  if (hash) {
    const pathOnly = hash.split("?")[0] || "/"
    return pathOnly.startsWith("/") ? pathOnly : "/" + pathOnly
  }

  // 2. Check pathname if no hash: e.g. /lengkapi?provider=google or /oauth-success
  const pathname = window.location.pathname
  if (pathname && pathname !== "/") {
    return pathname
  }

  return "/"
}

export const useRoute = () => useSyncExternalStore(subscribe, readRoute)

export const navigate = (path: string, replace = false) => {
  const target = path.startsWith("/") ? path : "/" + path
  if (replace) {
    window.location.replace("#" + target)
  } else {
    window.location.hash = target
  }
}
