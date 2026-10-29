/**
 * @file useBuildMenu.ts
 * Business logic hook for managing Anno-style construction menu state.
 * Strictly decoupled from the rendering components (Separation of Concerns).
 */

import { useState, useEffect, useCallback } from 'react'
import type { RoadBuilder } from '../../game/roads/RoadBuilder'
import type { BuildingPlacement } from '../../game/buildings/BuildingPlacement'
import { BUILDING_DEFINITIONS } from '../../game/buildings/BuildingTypes'
import {
  type BuildCategoryId,
  type BuildItem,
} from './buildMenuData'

export interface UseBuildMenuOptions {
  readonly roadBuilder?: RoadBuilder | null
  readonly buildingPlacement?: BuildingPlacement | null
  readonly initialOpen?: boolean
  readonly initialCategory?: BuildCategoryId
  readonly onSelectItem?: (item: BuildItem | null) => void
}

export interface UseBuildMenuReturn {
  readonly isOpen: boolean
  readonly activeCategory: BuildCategoryId
  readonly selectedItemId: string | null
  readonly hoveredItem: BuildItem | null
  readonly isRoadActive: boolean
  readonly isBuildingActive: boolean
  readonly activeBuildingName: string
  readonly toggleOpen: () => void
  readonly setOpen: (open: boolean) => void
  readonly selectCategory: (category: BuildCategoryId) => void
  readonly selectItem: (item: BuildItem) => void
  readonly clearSelection: () => void
  readonly setHoveredItem: (item: BuildItem | null) => void
}

export function useBuildMenu({
  roadBuilder = null,
  buildingPlacement = null,
  initialOpen = true,
  initialCategory = 'infrastructure',
  onSelectItem,
}: UseBuildMenuOptions = {}): UseBuildMenuReturn {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [activeCategory, setActiveCategory] = useState<BuildCategoryId>(initialCategory)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [hoveredItem, setHoveredItem] = useState<BuildItem | null>(null)
  const [isRoadActive, setIsRoadActive] = useState<boolean>(() => {
    try {
      return roadBuilder ? roadBuilder.isActive() : false
    } catch {
      return false
    }
  })
  const [isBuildingActive, setIsBuildingActive] = useState<boolean>(() => {
    try {
      return buildingPlacement ? buildingPlacement.isActive() : false
    } catch {
      return false
    }
  })
  const [activeBuildingName, setActiveBuildingName] = useState<string>('')

  // Synchronize with external roadBuilder state changes
  useEffect(() => {
    if (!roadBuilder) {
      setIsRoadActive(false)
      return
    }

    const syncRoadState = () => {
      try {
        const active = roadBuilder.isActive()
        setIsRoadActive(active)
        if (active) {
          setSelectedItemId('dirt_road')
        } else {
          setSelectedItemId((prev) => (prev === 'dirt_road' ? null : prev))
        }
      } catch (err) {
        console.error('Failed to sync RoadBuilder state:', err)
      }
    }

    syncRoadState()
    const unsubscribe = roadBuilder.subscribe(syncRoadState)
    return () => {
      unsubscribe()
    }
  }, [roadBuilder])

  // Synchronize with external buildingPlacement state changes
  useEffect(() => {
    if (!buildingPlacement) {
      setIsBuildingActive(false)
      return
    }

    const syncBuildingState = () => {
      try {
        const active = buildingPlacement.isActive()
        setIsBuildingActive(active)
        const def = buildingPlacement.getActiveDefinition()
        if (active && def) {
          setSelectedItemId(def.id)
          setActiveBuildingName(def.name)
        } else {
          setSelectedItemId((prev) => (prev !== 'dirt_road' ? null : prev))
          setActiveBuildingName('')
        }
      } catch (err) {
        console.error('Failed to sync BuildingPlacement state:', err)
      }
    }

    syncBuildingState()
    const unsubscribe = buildingPlacement.subscribe(syncBuildingState)
    return () => {
      unsubscribe()
    }
  }, [buildingPlacement])

  // Select or toggle a buildable item
  const selectItem = useCallback(
    (item: BuildItem) => {
      if (!item.isAvailable) {
        return
      }

      if (selectedItemId === item.id) {
        // Deselect current item
        setSelectedItemId(null)
        if (item.toolKey === 'dirt_road' && roadBuilder) {
          roadBuilder.deactivate()
        }
        if (buildingPlacement && buildingPlacement.isActive()) {
          buildingPlacement.deactivate()
        }
        onSelectItem?.(null)
        return
      }

      setSelectedItemId(item.id)
      onSelectItem?.(item)

      if (item.toolKey === 'dirt_road' && roadBuilder) {
        buildingPlacement?.deactivate()
        roadBuilder.activate('dirt')
      } else {
        roadBuilder?.deactivate()
        const def = BUILDING_DEFINITIONS[item.id]
        if (def && buildingPlacement) {
          buildingPlacement.activate(def)
        }
      }
    },
    [selectedItemId, roadBuilder, buildingPlacement, onSelectItem]
  )

  const clearSelection = useCallback(() => {
    setSelectedItemId(null)
    if (roadBuilder && roadBuilder.isActive()) {
      roadBuilder.deactivate()
    }
    if (buildingPlacement && buildingPlacement.isActive()) {
      buildingPlacement.deactivate()
    }
    onSelectItem?.(null)
  }, [roadBuilder, buildingPlacement, onSelectItem])

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const selectCategory = useCallback((category: BuildCategoryId) => {
    setActiveCategory(category)
  }, [])

  // Keyboard shortcut listeners (B to toggle build menu, Escape to deselect/close)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Avoid intercepting input fields or textareas
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      if (event.key === 'b' || event.key === 'B' || event.key === 'لا') {
        event.preventDefault()
        setIsOpen((prev) => !prev)
        return
      }

      if (event.key === 'Escape') {
        if (roadBuilder && roadBuilder.isDragging()) {
          roadBuilder.cancelDrag()
          return
        }

        if (roadBuilder && roadBuilder.isActive()) {
          roadBuilder.deactivate()
          setSelectedItemId(null)
          return
        }

        if (selectedItemId !== null) {
          setSelectedItemId(null)
          return
        }

        if (isOpen) {
          setIsOpen(false)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [roadBuilder, selectedItemId, isOpen])

  return {
    isOpen,
    activeCategory,
    selectedItemId,
    hoveredItem,
    isRoadActive,
    isBuildingActive,
    activeBuildingName,
    toggleOpen,
    setOpen: setIsOpen,
    selectCategory,
    selectItem,
    clearSelection,
    setHoveredItem,
  }
}
