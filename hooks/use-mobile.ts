import * as React from "react"

// Below xl: overlay (sheet) sidebar, closed by default. xl+: persistent docked sidebar.
const SIDEBAR_OVERLAY_BREAKPOINT = 1280

function getIsMobileSnapshot() {
  if (typeof window === "undefined") return false
  return window.innerWidth < SIDEBAR_OVERLAY_BREAKPOINT
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(getIsMobileSnapshot)

  React.useEffect(() => {
    const mql = window.matchMedia(
      `(max-width: ${SIDEBAR_OVERLAY_BREAKPOINT - 1}px)`,
    )
    const onChange = () => {
      setIsMobile(getIsMobileSnapshot())
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
