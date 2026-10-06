import type { GuideTargetSnapshot } from "./guide-target"

export interface GuidePoint { x: number; y: number }
export interface GuideMotionFrame {
  point: GuidePoint
  destination: GuidePoint
  travelling: boolean
}
export interface GuideMotionInput {
  snapshot: GuideTargetSnapshot
  scene: unknown
  run?: unknown
  active: boolean
  playing: boolean
  reducedMotion: boolean
}
export interface GuideMotionEnvironment {
  requestFrame: (callback: (now: number) => void) => number
  cancelFrame: (id: number) => void
  now: () => number
  onFrame: (frame: GuideMotionFrame) => void
}

const DURATION_MS = 280
const samePoint = (a: GuidePoint, b: GuidePoint) => a.x === b.x && a.y === b.y

/** A run-local visual interpolator. It cannot interact with target elements. */
export function createGuidePointerMotion(environment: GuideMotionEnvironment) {
  let frameId: number | null = null
  let disposed = false
  let previous: { scene: unknown; run: unknown; point: GuidePoint } | null = null
  let destination: GuidePoint | null = null
  let drawn: GuidePoint | null = null
  let moving = false

  const cancel = () => {
    if (frameId !== null) environment.cancelFrame(frameId)
    frameId = null
    moving = false
  }
  const emit = (point: GuidePoint, target: GuidePoint, travelling: boolean) => {
    drawn = point
    environment.onFrame({ point, destination: target, travelling })
  }
  const snap = () => {
    if (disposed) return
    cancel()
    if (destination) {
      emit(destination, destination, false)
      if (previous) previous.point = destination
    }
  }
  const reset = () => {
    cancel()
    previous = null
    destination = null
    drawn = null
  }

  return {
    update(input: GuideMotionInput) {
      if (disposed) return
      const { snapshot, scene, run, active, playing, reducedMotion } = input
      if (!active || snapshot.status === "background") { reset(); return }
      if (previous && previous.run !== run) reset()
      if (snapshot.status !== "visible" || !snapshot.point) {
        // An inactive snapshot is the deliberate one-render measurement gap on
        // scene change. Retain the last DRAWN point, but draw nothing in that gap.
        // A genuinely missing/offscreen/obscured target invalidates the origin.
        if (snapshot.status === "inactive" && playing && !reducedMotion) {
          cancel()
          if (previous && drawn) previous.point = drawn
          destination = null
        } else reset()
        return
      }

      const target = { ...snapshot.point }
      const nextScene = previous !== null && previous.scene !== scene
      const geometryChanged = destination !== null && !samePoint(destination, target)
      const origin = drawn ?? previous?.point
      const shouldTravel = !!previous && nextScene && playing && !reducedMotion
        && !!origin && !samePoint(origin, target)

      // An unchanged snapshot must not restart an in-flight scene transition.
      if (!nextScene && moving && !geometryChanged && playing && !reducedMotion) return
      cancel()
      destination = target
      previous = { scene, run, point: target }

      if (!shouldTravel || !origin) { emit(target, target, false); return }

      const from = { ...origin }
      const started = environment.now()
      moving = true
      emit(from, target, true)
      const tick = (now: number) => {
        frameId = null
        if (disposed || !moving) return
        const progress = Math.min(1, Math.max(0, (now - started) / DURATION_MS))
        const eased = 1 - Math.pow(1 - progress, 3)
        const point = { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased }
        if (progress === 1) {
          moving = false
          emit(target, target, false)
        } else {
          emit(point, target, true)
          frameId = environment.requestFrame(tick)
        }
      }
      frameId = environment.requestFrame(tick)
    },
    /** Scroll/resize interrupts travel immediately; geometry then follows live. */
    snap,
    /** Background/close invalidates the last run's visual origin. */
    reset,
    dispose() { disposed = true; reset() },
  }
}
