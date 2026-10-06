"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createGuidePointerMotion, type GuideMotionInput } from "./guide-motion"

/** Animate a small wrapper; the fixed root stays pinned to live target geometry. */
export function useGuideMotion(input: GuideMotionInput) {
  const wrapper = useRef<HTMLSpanElement>(null)
  const [travelling, setTravelling] = useState(false)
  const moving = useRef(false)
  const controller = useRef<ReturnType<typeof createGuidePointerMotion> | null>(null)
  if (!controller.current) {
    controller.current = createGuidePointerMotion({
      requestFrame: callback => window.requestAnimationFrame(callback),
      cancelFrame: id => window.cancelAnimationFrame(id),
      now: () => performance.now(),
      onFrame: frame => {
        if (wrapper.current) {
          const x = frame.point.x - frame.destination.x
          const y = frame.point.y - frame.destination.y
          wrapper.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
        }
        if (moving.current !== frame.travelling) {
          moving.current = frame.travelling
          setTravelling(frame.travelling)
        }
      },
    })
  }
  const { snapshot, scene, run, active, playing, reducedMotion } = input
  useLayoutEffect(() => {
    controller.current!.update({ snapshot, scene, run, active, playing, reducedMotion })
    if (snapshot.status !== "visible" && moving.current) {
      moving.current = false
      setTravelling(false)
    }
  }, [snapshot, scene, run, active, playing, reducedMotion])
  useEffect(() => {
    if (!active) return
    const interrupt = () => controller.current?.snap()
    const visibility = () => { if (document.visibilityState === "hidden") controller.current?.reset() }
    window.addEventListener("scroll", interrupt, { capture: true, passive: true })
    window.addEventListener("resize", interrupt, { passive: true })
    window.visualViewport?.addEventListener("scroll", interrupt, { passive: true })
    window.visualViewport?.addEventListener("resize", interrupt, { passive: true })
    document.addEventListener("visibilitychange", visibility)
    return () => {
      window.removeEventListener("scroll", interrupt, true)
      window.removeEventListener("resize", interrupt)
      window.visualViewport?.removeEventListener("scroll", interrupt)
      window.visualViewport?.removeEventListener("resize", interrupt)
      document.removeEventListener("visibilitychange", visibility)
      controller.current?.reset()
    }
  }, [active])
  useEffect(() => () => controller.current?.reset(), [])
  return { wrapper, travelling }
}
