export type FrameRateReading = {
  state: 'measuring' | 'active' | 'stalled' | 'paused'
  fps: number | null
  frameTimeMs: number | null
}

const samplingWindowMs = 1000
const maximumFrameGapMs = 1000
const emptyReading: FrameRateReading = { state: 'measuring', fps: null, frameTimeMs: null }

export function createFrameRateMonitor() {
  let previousTime: number | undefined
  let windowStart: number | undefined
  let frameCount = 0

  const reset = () => {
    previousTime = undefined
    windowStart = undefined
    frameCount = 0
  }

  return {
    record(time: number, active = true): FrameRateReading {
      if (!active) {
        reset()
        return { state: 'paused', fps: null, frameTimeMs: null }
      }

      if (previousTime === undefined) {
        previousTime = time
        windowStart = time
        return emptyReading
      }

      const frameDelta = time - previousTime
      previousTime = time
      if (frameDelta <= 0) return emptyReading
      if (frameDelta > maximumFrameGapMs) {
        windowStart = time
        frameCount = 0
        return { state: 'stalled', fps: null, frameTimeMs: null }
      }

      frameCount += 1
      const elapsed = time - (windowStart ?? time)
      if (elapsed < samplingWindowMs) return emptyReading

      const reading = {
        state: 'active' as const,
        fps: Math.round((frameCount * 1000) / elapsed),
        frameTimeMs: Number((elapsed / frameCount).toFixed(1)),
      }
      windowStart = time
      frameCount = 0
      return reading
    },
    reset,
  }
}
