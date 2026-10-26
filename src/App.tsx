import { useEffect, useRef, useState } from 'react'
import { createIslandScene, type IslandSceneHandle } from './game/island/IslandScene'

function App() {
  const containerRef = useRef<HTMLElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let active = true
    let scene: IslandSceneHandle | undefined
    let observer: ResizeObserver | undefined
    const onFatalError = (message: string) => {
      if (!active) return
      setError(message || 'تعذّر تحميل مشهد الجزيرة. يرجى المحاولة مرة أخرى.')
      setLoading(false)
    }

    void createIslandScene(container, onFatalError).then((handle) => {
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
        <aside className="scene-hints" aria-label="تعليمات التحكم">
          <p>الأسهم للتحرك · عجلة الفأرة للتقريب والإبعاد · Ctrl للدوران</p>
          <p className="scene-uninhabited">الجزيرة غير مأهولة</p>
        </aside>
      )}
    </main>
  )
}

export default App
