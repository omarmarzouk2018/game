import { useEffect, useState } from 'react'
import { RoadBuilder } from '../game/roads/RoadBuilder'
import { type RoadValidationResult } from '../game/roads/RoadTypes'

export interface RoadPreviewOverlayProps {
  readonly roadBuilder: RoadBuilder | null
}

/**
 * RoadPreviewOverlay displays real-time cost and validation status while dragging a road.
 */
export function RoadPreviewOverlay({ roadBuilder }: RoadPreviewOverlayProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [validation, setValidation] = useState<RoadValidationResult | null>(null)

  useEffect(() => {
    if (!roadBuilder) return

    const updateState = () => {
      setIsDragging(roadBuilder.isDragging())
      setValidation(roadBuilder.getCurrentValidation())
    }

    updateState()
    const unsubscribe = roadBuilder.subscribe(updateState)
    return () => unsubscribe()
  }, [roadBuilder])

  if (!isDragging || !validation) {
    return null
  }

  return (
    <div
      className={`road-preview-overlay ${validation.isValid ? 'is-valid' : 'is-invalid'}`}
      role="status"
      aria-live="polite"
    >
      {validation.isValid ? (
        <div className="road-preview-content">
          <span className="preview-status-badge valid">✓ مسار صالح</span>
          <span className="preview-cost">
            التكلفة: <strong>{validation.totalCost}</strong> 🪙 ({validation.newTileCount} بلاطة جديدة)
          </span>
        </div>
      ) : (
        <div className="road-preview-content">
          <span className="preview-status-badge invalid">✕ تعذر البناء</span>
          <span className="preview-reason">{validation.reason ?? 'موقع غير صالح'}</span>
        </div>
      )}
    </div>
  )
}
