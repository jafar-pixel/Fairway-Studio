"use client"

import { useEffect, useState } from "react"
import { inactiveGuideTarget, observeGuideTarget, type GuideTarget, type GuideTargetSnapshot } from "./guide-target"

export function useGuideTarget(target: GuideTarget, enabled = true): GuideTargetSnapshot {
  const [state, setState] = useState<{ target: GuideTarget; value: GuideTargetSnapshot } | null>(null)
  useEffect(() => {
    if (!enabled) { setState(null); return }
    return observeGuideTarget(target, value => setState({ target, value }))
  }, [target, enabled])
  // Never flash the previous step's pointer while the next effect acquires a target.
  return enabled && state?.target === target ? state.value : inactiveGuideTarget
}

export function useGuideReducedMotion(enabled = true): boolean {
  // Start static for SSR/hydration; enable animation only after checking preference.
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    if (!enabled) return
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [enabled])
  return reduced
}
