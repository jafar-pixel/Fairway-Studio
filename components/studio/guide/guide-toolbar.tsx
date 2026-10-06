"use client"

import { useRef, type KeyboardEvent, type ReactNode } from "react"
import "./guide.css"

export interface GuideToolbarProps {
  title: string
  caption?: string
  playing: boolean
  /** One-based display index. The coordinator owns the run state. */
  step: number
  total: number
  canBack?: boolean
  canNext?: boolean
  /** Navigation pending: stop duplicate actions; Close always stays available. */
  busy?: boolean
  onTogglePlay: () => void
  onBack: () => void
  onNext: () => void
  onRestart: () => void
  onClose: () => void
  /** Move to the other edge when a step targets content underneath the toolbar. */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left"
  className?: string
}

function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
}

/** Nonmodal, compact controls. Keyboard events are scoped to this toolbar. */
export function GuideToolbar({ title, caption, playing, step, total, canBack = step > 1, canNext = step < total, busy = false, onTogglePlay, onBack, onNext, onRestart, onClose, position = "bottom-right", className = "" }: GuideToolbarProps) {
  const root = useRef<HTMLDivElement>(null)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])]
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    if (index === -1 || !buttons.length) return
    event.preventDefault()
    event.stopPropagation()
    let next = index
    if (event.key === "Home") next = 0
    if (event.key === "End") next = buttons.length - 1
    if (event.key === "ArrowLeft") next = (index - 1 + buttons.length) % buttons.length
    if (event.key === "ArrowRight") next = (index + 1) % buttons.length
    buttons[next]?.focus()
  }
  const safeTotal = Math.max(1, total)
  const safeStep = Math.max(1, Math.min(step, safeTotal))
  return <section className={`fw-guide-toolbar ${className}`} data-guide-toolbar="" data-guide-player="" data-position={position} aria-label="Fairway guide" aria-busy={busy}>
    <div className="fw-guide-toolbar__copy" role="status" aria-live="polite" aria-atomic="true">
      <span className="fw-guide-toolbar__eyebrow">GUIDE <span>{safeStep} / {safeTotal}</span></span>
      <span className="fw-guide-toolbar__title">{title}</span>
      {caption && <span className="fw-guide-toolbar__caption" title={caption}>{caption}</span>}
    </div>
    <div ref={root} className="fw-guide-toolbar__actions" role="toolbar" aria-label="Guide controls" onKeyDown={onKeyDown}>
      <button type="button" className="fw-guide-toolbar__play" onClick={onTogglePlay} disabled={busy} aria-label={playing ? "Pause guide" : "Play guide"} title={playing ? "Pause guide" : "Play guide"}>
        <Icon>{playing ? <><path d="M8 5v14M16 5v14" strokeWidth="3" /></> : <path d="m8 5 11 7-11 7V5Z" />}</Icon><span>{playing ? "Pause" : "Play"}</span>
      </button>
      <button type="button" onClick={onBack} disabled={busy || !canBack} aria-label="Previous guide step" title="Previous step"><Icon><path d="m14 6-6 6 6 6" /></Icon></button>
      <button type="button" onClick={onNext} disabled={busy || !canNext} aria-label="Next guide step" title="Next step"><Icon><path d="m10 6 6 6-6 6" /></Icon></button>
      <span className="fw-guide-toolbar__divider" aria-hidden="true" />
      <button type="button" onClick={onRestart} disabled={busy} aria-label="Restart guide" title="Restart guide"><Icon><path d="M3 10a9 9 0 1 1 1.7 8M3 4v6h6" /></Icon></button>
      <button type="button" onClick={onClose} aria-label="Close guide" title="Close guide (Escape)"><Icon><path d="m6 6 12 12M6 18 18 6" /></Icon></button>
    </div>
  </section>
}
