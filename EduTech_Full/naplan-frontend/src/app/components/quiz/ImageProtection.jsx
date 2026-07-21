/**
 * ImageProtection.jsx
 *
 * Renders nothing. While mounted, it blocks the browser's default
 * right-click / long-press / drag behaviour on IMAGES ONLY.
 *
 * Mounted inside QuestionRenderer, so it is active exactly while a child is
 * taking a quiz and detaches automatically on unmount. It does NOT block
 * right-click anywhere else in the app (parent dashboard, admin screens), and
 * it does NOT block right-click on question TEXT — only on <img> elements.
 *
 * ⚠️ WHAT THIS DOES AND DOES NOT DO
 *
 *   Stops:  right-click → Save image as / Copy image
 *           click-and-drag an image to the desktop
 *           long-press → Save Image on iOS/Android
 *
 *   Does NOT stop: DevTools, View Source, the Network tab, screenshots, or
 *   anyone pasting the S3 URL straight into a browser. Those are not blockable
 *   from a web page — any site claiming to "disable Inspect" is running a key
 *   listener that a determined user bypasses in seconds, and on a children's
 *   product it mostly just breaks accessibility tooling.
 *
 *   Treat this as a deterrent against casual copying, not as content
 *   protection. Real protection would mean signed, short-lived S3 URLs so a
 *   copied link expires — worth doing separately if the question bank is the
 *   commercial asset.
 */

import { useEffect } from "react";

export default function ImageProtection() {
  useEffect(() => {
    // Block the context menu when the target is an image, or anything
    // explicitly opted in with data-protect-image (e.g. a wrapper div).
    const onContextMenu = (e) => {
      const el = e.target;
      if (!el) return;
      const isImage =
        el.tagName === "IMG" ||
        (typeof el.closest === "function" && el.closest("[data-protect-image]"));
      if (isImage) {
        e.preventDefault();
        return false;
      }
    };

    // Block drag-to-desktop, which saves the file without a context menu.
    const onDragStart = (e) => {
      if (e.target && e.target.tagName === "IMG") {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  return null;
}