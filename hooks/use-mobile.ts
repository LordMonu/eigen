import * as React from "react"

// Below xl: overlay (sheet) sidebar, closed by default. xl+: persistent docked sidebar.
const SIDEBAR_OVERLAY_BREAKPOINT = 1280

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(
      `(max-width: ${SIDEBAR_OVERLAY_BREAKPOINT - 1}px)`,
    )
    const onChange = () => {
      setIsMobile(window.innerWidth < SIDEBAR_OVERLAY_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < SIDEBAR_OVERLAY_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
