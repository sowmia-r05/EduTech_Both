// src/app/components/ScrollToTop.jsx
//
// Resets the window scroll position to the top on every route change.
//
// WHY THIS EXISTS
//   HashRouter does not restore or reset scroll position by itself. When you
//   navigate from a page you had scrolled down (e.g. the landing page at the
//   Pricing/FAQ section) to another route, React swaps the DOM but the browser
//   keeps the old scrollY — so the new page "lands" halfway down.
//
//   Two separate causes are handled here:
//     1) Route change      → window.scrollTo(0, 0) in a layout effect.
//     2) Page RELOAD (F5)  → the browser's native scroll restoration replays
//                            the old offset. history.scrollRestoration is set
//                            to "manual" once, which disables that.
//
// WHY useLayoutEffect
//   It runs BEFORE the browser paints, so the user never sees a flash of the
//   page at the wrong offset. useEffect would scroll after paint = visible jump.
//
// WHY behavior: "instant"
//   global.css / index.css may set `html { scroll-behavior: smooth }` for the
//   react-scroll landing nav. Without an explicit override, every navigation
//   would animate a long smooth scroll back to the top, which looks broken.
//
// This must render INSIDE the Router. App.jsx mounts it at the top of
// <AuthProvider>, which sits under <HashRouter> in main.jsx.

import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, search } = useLocation();

  // Disable the browser's own scroll restoration exactly once.
  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useLayoutEffect(() => {
    // Some layouts scroll an inner container rather than <body>. Reset both the
    // window and the app root's scrollable ancestor to be safe.
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } catch {
      // Older Safari rejects behavior:"instant" — fall back to the 2-arg form.
      window.scrollTo(0, 0);
    }

    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // A second pass on the next frame catches pages whose content mounts
    // asynchronously (lazy data, images) and grows the document after the
    // first reset.
    const raf = requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    });

    return () => cancelAnimationFrame(raf);
  }, [pathname, search]);

  return null;
}