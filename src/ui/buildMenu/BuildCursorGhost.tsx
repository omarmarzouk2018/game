/**
 * @file BuildCursorGhost.tsx
 * Floating translucent blueprint cursor badge that follows the mouse pointer
 * whenever a road or building tool is selected, providing instant visual feedback.
 */

import { useEffect, useState, type CSSProperties } from 'react'
import type { RoadBuilder } from '../../game/roads/RoadBuilder'
import type { BuildingPlacement } from '../../game/buildings/BuildingPlacement'

export interface BuildCursorGhostProps {
  readonly roadBuilder: RoadBuilder | null
  readonly buildingPlacement: BuildingPlacement | null
}

export function BuildCursorGhost({
  roadBuilder,
  buildingPlacement,
}: BuildCursorGhostProps) {
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [isRoadActive, setIsRoadActive] = useState(false)
  const [isBuildingActive, setIsBuildingActive] = useState(false)
  const [buildingName, setBuildingName] = useState('')
  const [buildingCost, setBuildingCost] = useState(0)
  const [isValid, setIsValid] = useState(true)

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      setPointer({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener('pointermove', onPointerMove)
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [])

  useEffect(() => {
    if (!roadBuilder) return
    const updateRoad = () => {
      const active = roadBuilder.isActive()
      setIsRoadActive(active)
      if (active) {
        if (roadBuilder.isDragging()) {
          setIsValid(roadBuilder.getCurrentValidation()?.isValid ?? false)
        } else {
          setIsValid(roadBuilder.getHoverValidation()?.isValid ?? true)
        }
      }
    }
    updateRoad()
    return roadBuilder.subscribe(updateRoad)
  }, [roadBuilder])

  useEffect(() => {
    if (!buildingPlacement) return
    const updateBuilding = () => {
      const active = buildingPlacement.isActive()
      setIsBuildingActive(active)
      const def = buildingPlacement.getActiveDefinition()
      if (active && def) {
        setBuildingName(def.name)
        setBuildingCost(def.cost.gold)
        setIsValid(buildingPlacement.getCurrentValidation()?.isValid ?? true)
      } else {
        setBuildingName('')
        setBuildingCost(0)
      }
    }
    updateBuilding()
    return buildingPlacement.subscribe(updateBuilding)
  }, [buildingPlacement])

  const isActive = isRoadActive || isBuildingActive
  if (!isActive || !pointer) {
    return null
  }

  const tintColor = isValid ? '#00d2ff' : '#ff4757'
  const bgColor = isValid ? 'rgba(8, 26, 42, 0.78)' : 'rgba(42, 10, 16, 0.82)'
  const glowShadow = isValid
    ? '0 4px 18px rgba(0, 210, 255, 0.35)'
    : '0 4px 18px rgba(255, 71, 87, 0.35)'

  const style: CSSProperties = {
    position: 'fixed',
    left: pointer.x + 16,
    top: pointer.y + 16,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 11px',
    borderRadius: '7px',
    background: bgColor,
    border: `1.5px solid ${tintColor}`,
    boxShadow: glowShadow,
    color: '#f0f8ff',
    fontSize: '0.78rem',
    fontFamily: 'inherit',
    pointerEvents: 'none',
    zIndex: 1000,
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    whiteSpace: 'nowrap',
    transition: 'border-color 0.12s ease, background 0.12s ease',
  }

  const badgeDotStyle: CSSProperties = {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: tintColor,
    boxShadow: `0 0 8px ${tintColor}`,
    flexShrink: 0,
  }

  return (
    <div style={style} role="status" aria-live="off">
      <span style={badgeDotStyle} />
      {isRoadActive && (
        <span>
          🛤️ <strong>طريق ترابي</strong> (5 🪙)
        </span>
      )}
      {isBuildingActive && (
        <span>
          🏛️ <strong>{buildingName}</strong> ({buildingCost} 🪙)
        </span>
      )}
      {!isValid && (
        <span style={{ color: '#ff6b81', marginRight: '4px' }}>• غير متاح هنا</span>
      )}
    </div>
  )
}
