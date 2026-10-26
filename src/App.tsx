import { useEffect, useRef, useState } from 'react'
import { createIslandScene, type IslandSceneHandle } from './game/island/IslandScene'
import type { FrameRateReading } from './game/island/FrameRateMonitor'

function App() {
  const containerRef = useRef<HTMLElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rotationActive, setRotationActive] = useState(false)
  const [frameRate, setFrameRate] = useState<FrameRateReading>({ state: 'measuring', fps: null, frameTimeMs: null })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Control') setRotationActive(true)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Control') setRotationActive(false)
    }
    const onBlur = () => setRotationActive(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let active = true
    let scene: IslandSceneHandle | undefined
    let observer: ResizeObserver | undefined
    setFrameRate({ state: 'measuring', fps: null, frameTimeMs: null })
    const onFatalError = (message: string) => {
      if (!active) return
      setError(message || 'تعذّر تحميل مشهد الجزيرة. يرجى المحاولة مرة أخرى.')
      setLoading(false)
    }

    void createIslandScene(container, onFatalError, {
      onFrameRateUpdate: (reading) => {
        if (active) setFrameRate(reading)
      },
    }).then((handle) => {
      if (!active) {
        handle.dispose()
        return
      }
      scene = handle
      setLoading(false)

      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => scene?.resize())
        observer.observe(container)
      } else {
        window.addEventListener('resize', handle.resize)
      }
    }).catch((reason: unknown) => {
      if (!active) return
      const detail = reason instanceof Error ? ` (${reason.message})` : ''
      setError(`تعذّر تحميل مشهد الجزيرة. يرجى المحاولة مرة أخرى.${detail}`)
      setLoading(false)
    })

    return () => {
      active = false
      observer?.disconnect()
      window.removeEventListener('resize', scene?.resize ?? (() => {}))
      scene?.dispose()
    }
  }, [attempt])

  const retry = () => {
    setError('')
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  return (
    <main className="scene-shell">
      <section ref={containerRef} className="scene-host" data-testid="scene-host" aria-label="Island scene" />
      {loading && <p className="scene-loading" role="status">جارٍ تحميل مشهد الجزيرة…</p>}
      {error && (
        <div className="scene-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={retry}>إعادة المحاولة</button>
        </div>
      )}
      {!loading && !error && (
        <>
        <aside className="scene-performance" aria-label="أداء العرض" aria-live="off">
          <span>الأداء</span>
          {frameRate.state === 'active' ? (
            <span>{frameRate.fps} FPS · {frameRate.frameTimeMs} مللي ثانية</span>
          ) : (
            <span>{frameRate.state === 'stalled' ? 'توقف مؤقت · جارٍ القياس' : frameRate.state === 'paused' ? 'العرض متوقف' : 'جارٍ قياس الإطارات…'}</span>
          )}
        </aside>
        <aside className={`scene-hints${rotationActive ? ' is-rotating' : ''}`} aria-label="تعليمات التحكم">
          <p>الأسهم للتحرك · عجلة الفأرة للتقريب والإبعاد</p>
          <p className="scene-rotation-hint">اضغط مطولًا على Ctrl وحرّك المؤشر للدوران</p>
          {rotationActive && <p className="scene-rotation-active" role="status">الدوران نشط · حرّك المؤشر</p>}
          <p className="scene-uninhabited">الجزيرة غير مأهولة</p>
        </aside>
        </>
      )}
    </main>
  )
}

export default App
