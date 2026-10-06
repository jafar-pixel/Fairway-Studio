"use client"

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { type GuideTarget, type GuideTargetSnapshot } from "./guide-target"
import { useGuideReducedMotion, useGuideTarget } from "./use-guide-target"
import { useGuideMotion } from "./use-guide-motion"
import "./guide.css"

export interface GuidePointerProps {
  target: GuideTarget
  active?: boolean
  playing?: boolean
  /** Identifies a scene without remounting, so travel survives step changes. */
  stepKey?: string | number
  /** Reset travel origin on Restart/new run. Unmount/Close also clears it. */
  runKey?: string | number
  /** Optional short label; longer explanatory copy belongs in GuideToolbar. */
  label?: string
  onTargetChange?: (snapshot: GuideTargetSnapshot) => void
}

/** Only an illustration. No click dispatch, focus movement, scroll, or page writes. */
export function GuidePointer({ target, active = true, playing = true, stepKey, runKey, label, onTargetChange }: GuidePointerProps) {
  const snapshot = useGuideTarget(target, active)
  const reducedMotion = useGuideReducedMotion(active)
  const { wrapper, travelling } = useGuideMotion({ snapshot, scene: stepKey ?? target, run: runKey, active, playing, reducedMotion })
  useEffect(() => { onTargetChange?.(snapshot) }, [snapshot, onTargetChange])
  if (!active || snapshot.status !== "visible" || !snapshot.point || typeof document === "undefined") return null
  const { x, y } = snapshot.point
  const labelOnLeft = !!snapshot.viewport && x > snapshot.viewport.left + snapshot.viewport.width / 2
  const labelAbove = !!snapshot.viewport && y > snapshot.viewport.bottom - 90
  return createPortal(
    <div
      className="fw-guide-pointer"
      data-guide-pointer=""
      data-travelling={travelling ? "true" : "false"}
      data-playing={playing && !reducedMotion ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      aria-hidden="true"
      style={{ left: x, top: y, pointerEvents: "none" } as CSSProperties}
    >
      <span className="fw-guide-pointer__ring" />
      <span className="fw-guide-pointer__dot" />
      <span ref={wrapper} className="fw-guide-pointer__travel"><span className="fw-guide-pointer__bounce">
        <svg className="fw-guide-pointer__arrow" width="30" height="38" viewBox="0 0 30 38" fill="none" focusable="false">
          <path d="M3 2.5V29.3L10.1 23.9L16.3 35.1L21.1 32.5L14.9 21.6L24.1 20.2L3 2.5Z" fill="white" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round" />
        </svg>
      </span></span>
      {label && <span className="fw-guide-pointer__label" data-left={labelOnLeft} data-above={labelAbove}>{label}</span>}
    </div>,
    document.body,
  )
}

/** Render controls outside clipped/transformed application shells. */
export function GuidePortal({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [setReady])
  return ready ? createPortal(children, document.body) : null
}
