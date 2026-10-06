/** Read-only geometry tracking. This module never clicks, focuses, scrolls, or changes a target. */
export type GuideTarget = string | Element | null | (() => Element | null)

export type GuideTargetStatus =
  | "inactive"
  | "background"
  | "missing"
  | "hidden"
  | "offscreen"
  | "obscured"
  | "visible"

export interface GuideRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface GuideTargetSnapshot {
  status: GuideTargetStatus
  /** The pointer tip is here, in fixed-position CSS pixels. */
  point: { x: number; y: number } | null
  /** The actually visible portion, clipped to viewport and scroll containers. */
  rect: GuideRect | null
  viewport: GuideRect | null
}

export const inactiveGuideTarget: GuideTargetSnapshot = {
  status: "inactive", point: null, rect: null, viewport: null,
}

export function guideRect(left: number, top: number, right: number, bottom: number): GuideRect {
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

export function intersectGuideRects(a: GuideRect, b: GuideRect): GuideRect | null {
  const r = guideRect(Math.max(a.left, b.left), Math.max(a.top, b.top), Math.min(a.right, b.right), Math.min(a.bottom, b.bottom))
  return r.width > 1 && r.height > 1 ? r : null
}

function hidden(status: GuideTargetStatus, viewport: GuideRect | null): GuideTargetSnapshot {
  return { status, point: null, rect: null, viewport }
}

function viewportRect(win: Window): GuideRect {
  const visual = win.visualViewport
  const left = visual?.offsetLeft ?? 0
  const top = visual?.offsetTop ?? 0
  return guideRect(left, top, left + (visual?.width ?? win.innerWidth), top + (visual?.height ?? win.innerHeight))
}

function renderedStyle(style: CSSStyleDeclaration): boolean {
  return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && Number(style.opacity || 1) > 0
}

function clipAxis(value: string): boolean {
  return /^(auto|scroll|hidden|clip)$/.test(value)
}

function elementSnapshot(element: Element, doc: Document, win: Window, viewport: GuideRect): GuideTargetSnapshot {
  if (!element.isConnected || element.ownerDocument !== doc) return hidden("missing", viewport)
  if (!element.getClientRects().length) return hidden("hidden", viewport)
  const bounds = element.getBoundingClientRect()
  let visible = intersectGuideRects(guideRect(bounds.left, bounds.top, bounds.right, bounds.bottom), viewport)
  if (!visible) return hidden("offscreen", viewport)

  // Clipping parents matter for sidebars, carousels, and nested scrolling panes.
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = win.getComputedStyle(current)
    if (!renderedStyle(style) || current.hasAttribute("hidden")) return hidden("hidden", viewport)
    if (current === element) continue
    const clipX = clipAxis(style.overflowX)
    const clipY = clipAxis(style.overflowY)
    if (clipX || clipY) {
      const parent = current.getBoundingClientRect()
      // clientWidth/clientHeight exclude scrollbars; borders are excluded too.
      const scaleX = current instanceof HTMLElement && current.offsetWidth ? parent.width / current.offsetWidth : 1
      const scaleY = current instanceof HTMLElement && current.offsetHeight ? parent.height / current.offsetHeight : 1
      const left = parent.left + current.clientLeft * scaleX
      const top = parent.top + current.clientTop * scaleY
      visible = intersectGuideRects(visible, guideRect(
        clipX ? left : visible.left,
        clipY ? top : visible.top,
        clipX ? left + current.clientWidth * scaleX : visible.right,
        clipY ? top + current.clientHeight * scaleY : visible.bottom,
      ))
      if (!visible) return hidden("offscreen", viewport)
    }
  }

  // Try center, then four interior points. This avoids directing users behind a
  // dialog/header while still finding a real exposed portion of a large target.
  const candidates = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]
  for (const [fx, fy] of candidates) {
    const point = { x: visible.left + visible.width * fx, y: visible.top + visible.height * fy }
    const hit = doc.elementFromPoint?.(point.x, point.y)
    if (!doc.elementFromPoint || (hit && (hit === element || element.contains(hit)))) {
      return { status: "visible", point, rect: visible, viewport }
    }
  }
  // Preserve safe geometry so the coordinator can move its own toolbar away.
  // A null point still prevents drawing a cue over an occluding modal/toolbar.
  return { status: "obscured", point: null, rect: visible, viewport }
}

/** A selector may match desktop and mobile copies; use the one actually on screen. */
export function readGuideTarget(target: GuideTarget, doc: Document, win: Window): GuideTargetSnapshot {
  const viewport = viewportRect(win)
  if (doc.visibilityState === "hidden") return hidden("background", viewport)
  let elements: Element[]
  try {
    if (typeof target === "string") elements = [...doc.querySelectorAll(target)]
    else {
      const resolved = typeof target === "function" ? target() : target
      elements = resolved ? [resolved] : []
    }
  } catch {
    return hidden("missing", viewport)
  }
  let result = hidden("missing", viewport)
  for (const element of elements) {
    const candidate = elementSnapshot(element, doc, win, viewport)
    if (candidate.status === "visible") return candidate
    result = candidate
  }
  return result
}

export function sameGuideTarget(a: GuideTargetSnapshot, b: GuideTargetSnapshot): boolean {
  if (a.status !== b.status) return false
  const close = (x: number, y: number) => Math.abs(x - y) < 0.25
  const rectSame = (x: GuideRect | null, y: GuideRect | null) => x === y || (!!x && !!y && close(x.left, y.left) && close(x.top, y.top) && close(x.right, y.right) && close(x.bottom, y.bottom))
  return rectSame(a.rect, b.rect) && rectSame(a.viewport, b.viewport)
    && (a.point === b.point || (!!a.point && !!b.point && close(a.point.x, b.point.x) && close(a.point.y, b.point.y)))
}

/**
 * Observe without mutating the page. rAF catches CSS transitions and layout
 * shifts that ResizeObserver cannot. Background tabs schedule no frames.
 * The returned cleanup is idempotent; call it on Close/unmount/step replacement.
 */
export function observeGuideTarget(
  target: GuideTarget,
  onChange: (snapshot: GuideTargetSnapshot) => void,
  { doc = document, win = window }: { doc?: Document; win?: Window } = {},
): () => void {
  let disposed = false
  let frame: number | null = null
  let previous: GuideTargetSnapshot | null = null
  let lastRead = -Infinity
  const emit = () => {
    if (disposed) return
    const next = readGuideTarget(target, doc, win)
    if (!previous || !sameGuideTarget(previous, next)) { previous = next; onChange(next) }
  }
  const loop = (now: number) => {
    frame = null
    if (disposed || doc.visibilityState === "hidden") return
    // 30fps is ample for gentle target movement; no React render when unchanged.
    if (now - lastRead >= 32) { lastRead = now; emit() }
    if (!disposed) frame = win.requestAnimationFrame(loop)
  }
  const start = () => {
    if (disposed) return
    emit()
    if (doc.visibilityState !== "hidden" && frame === null) frame = win.requestAnimationFrame(loop)
  }
  const visibility = () => {
    if (frame !== null) { win.cancelAnimationFrame(frame); frame = null }
    lastRead = -Infinity
    start()
  }
  const layout = () => { if (doc.visibilityState !== "hidden") emit() }
  doc.addEventListener("visibilitychange", visibility)
  win.addEventListener("scroll", layout, { capture: true, passive: true })
  win.addEventListener("resize", layout, { passive: true })
  win.visualViewport?.addEventListener("resize", layout, { passive: true })
  win.visualViewport?.addEventListener("scroll", layout, { passive: true })
  start()
  return () => {
    if (disposed) return
    disposed = true
    if (frame !== null) win.cancelAnimationFrame(frame)
    frame = null
    doc.removeEventListener("visibilitychange", visibility)
    win.removeEventListener("scroll", layout, true)
    win.removeEventListener("resize", layout)
    win.visualViewport?.removeEventListener("resize", layout)
    win.visualViewport?.removeEventListener("scroll", layout)
  }
}
