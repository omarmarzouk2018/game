import { describe, expect, it } from 'vitest'
import { createFrameRateMonitor } from './FrameRateMonitor'

describe('createFrameRateMonitor', () => {
  it('reports average FPS and frame time after a complete sampling window', () => {
    const monitor = createFrameRateMonitor()

    expect(monitor.record(0)).toEqual({ state: 'measuring', fps: null, frameTimeMs: null })
    for (let time = 16; time <= 1000; time += 16) monitor.record(time)

    const reading = monitor.record(1008)
    expect(reading.state).toBe('active')
    expect(reading.fps).toBeGreaterThan(60)
    expect(reading.fps).toBeLessThan(64)
    expect(reading.frameTimeMs).toBeGreaterThan(15)
    expect(reading.frameTimeMs).toBeLessThan(17)
  })

  it('discards samples across a long frame gap and starts a fresh window', () => {
    const monitor = createFrameRateMonitor()
    monitor.record(0)
    for (let time = 16; time <= 480; time += 16) monitor.record(time)

    expect(monitor.record(1500)).toEqual({ state: 'stalled', fps: null, frameTimeMs: null })
    expect(monitor.record(1516).state).toBe('measuring')
  })

  it('reports paused while rendering is unavailable and resets when resumed', () => {
    const monitor = createFrameRateMonitor()
    monitor.record(0)
    monitor.record(16)

    expect(monitor.record(32, false)).toEqual({ state: 'paused', fps: null, frameTimeMs: null })
    expect(monitor.record(48).state).toBe('measuring')
  })
})
