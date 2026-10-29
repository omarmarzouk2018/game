import { useEffect, useState } from 'react'
import { RoadBuilder } from '../game/roads/RoadBuilder'

export interface RoadToolbarProps {
  readonly roadBuilder: RoadBuilder | null
}

/**
 * RoadToolbar provides controls to activate/deactivate the dirt road builder tool.
 */
export function RoadToolbar({ roadBuilder }: RoadToolbarProps) {
  const [isActive, setIsActive] = useState(roadBuilder ? roadBuilder.isActive() : false)

  useEffect(() => {
    if (!roadBuilder) return
    setIsActive(roadBuilder.isActive())
    const unsubscribe = roadBuilder.subscribe(() => {
      setIsActive(roadBuilder.isActive())
    })
    return () => unsubscribe()
  }, [roadBuilder])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && roadBuilder && roadBuilder.isActive()) {
        if (roadBuilder.isDragging()) {
          roadBuilder.cancelDrag()
        } else {
          roadBuilder.deactivate()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [roadBuilder])

  const toggleDirtRoad = () => {
    if (!roadBuilder) return
    if (isActive) {
      roadBuilder.deactivate()
    } else {
      roadBuilder.activate('dirt')
    }
  }

  return (
    <aside className="road-toolbar" role="toolbar" aria-label="أدوات البناء">
      <button
        type="button"
        className={`road-tool-btn ${isActive ? 'is-active' : ''}`}
        onClick={toggleDirtRoad}
        aria-pressed={isActive}
        title="بناء طريق ترابي (5 عملات / بلاطة)"
      >
        <span className="road-tool-icon" aria-hidden="true">🛤️</span>
        <span className="road-tool-text">طريق ترابي</span>
        <span className="road-tool-cost">5 🪙</span>
      </button>

      {isActive && (
        <div className="road-tool-hint" role="status">
          اسحب بالمؤشر على الأرض لرسم الطريق • اضغط Esc للإلغاء
        </div>
      )}
    </aside>
  )
}
