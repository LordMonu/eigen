"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Only left click, no modifier keys.
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // Walk up to the anchor.
      let el = e.target as HTMLElement | null;
      while (el && el.tagName !== "A") el = el.parentElement;
      if (!el) return;
      const anchor = el as HTMLAnchorElement;
      const href = anchor.getAttribute("href");
      if (!href) return;
      // Skip external, mailto, tel, hash links.
      if (href.startsWith("http") && !href.startsWith(window.location.origin))
        return;
      if (
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#")
      )
        return;
      // Skip same-page links.
      if (href === pathname) return;
      // Skip when target is set to open new tab.
      if (anchor.target && anchor.target !== "_self") return;

      setActive(true);
      setProgress(20);
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, [pathname]);

  // When pathname changes, the navigation completed — finish + hide.
  useEffect(() => {
    if (!active) return;
    setProgress(100);
    const t = setTimeout(() => {
      setActive(false);
      setProgress(0);
    }, 250);
    return () => clearTimeout(t);
  }, [pathname, active]);

  // Trickle progress up while waiting.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setProgress((p) => (p < 80 ? p + Math.random() * 8 : p));
    }, 200);
    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-0.5 bg-transparent pointer-events-none">
      <div
        className="h-full bg-lime-400 shadow-[0_0_10px_rgba(163,230,53,0.6)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
