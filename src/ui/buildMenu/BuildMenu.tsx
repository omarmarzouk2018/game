/**
 * @file BuildMenu.tsx
 * Anno-inspired bottom construction menu dock for city & infrastructure building.
 * Implemented using React components and co-located inline styles.
 */

import { type CSSProperties } from 'react'
import type { RoadBuilder } from '../../game/roads/RoadBuilder'
import type { BuildingPlacement } from '../../game/buildings/BuildingPlacement'
import {
  BUILD_CATEGORIES,
  type BuildItem,
} from './buildMenuData'
import { buildMenuStyles, buildMenuTheme } from './buildMenuTheme'
import { useBuildMenu } from './useBuildMenu'
import { BuildMenuToggle } from './BuildMenuToggle'
import { BuildCategoryTabs } from './BuildCategoryTabs'
import { BuildItemGrid } from './BuildItemGrid'
import { BuildItemTooltip } from './BuildItemTooltip'

export interface BuildMenuProps {
  readonly roadBuilder?: RoadBuilder | null
  readonly buildingPlacement?: BuildingPlacement | null
  readonly onSelectItem?: (item: BuildItem | null) => void
  readonly initialOpen?: boolean
}

export function BuildMenu({
  roadBuilder = null,
  buildingPlacement = null,
  onSelectItem,
  initialOpen = true,
}: BuildMenuProps) {
  const {
    isOpen,
    activeCategory,
    selectedItemId,
    hoveredItem,
    isRoadActive,
    isBuildingActive,
    activeBuildingName,
    toggleOpen,
    selectCategory,
    selectItem,
    setHoveredItem,
  } = useBuildMenu({
    roadBuilder,
    buildingPlacement,
    initialOpen,
    onSelectItem,
  })

  const currentCategory =
    BUILD_CATEGORIES.find((cat) => cat.id === activeCategory) ??
    BUILD_CATEGORIES[0]

  const activeCount = selectedItemId ? 1 : 0

  const activeHintStyle: CSSProperties = {
    position: 'absolute',
    bottom: isOpen ? 'calc(100% + 0.65rem)' : 'calc(100% + 0.5rem)',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '0.45rem 1rem',
    borderRadius: '0.55rem',
    background: 'rgba(12, 22, 34, 0.95)',
    border: `1px solid ${buildMenuTheme.colors.goldPrimary}`,
    color: buildMenuTheme.colors.textPrimary,
    fontSize: '0.82rem',
    boxShadow: '0 6px 16px rgba(0, 0, 0, 0.4)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    zIndex: 25,
  }

  return (
    <aside
      style={buildMenuStyles.container}
      role="toolbar"
      aria-label="شريط بناء المستوطنة والبنية التحتية"
    >
      {/* Active tool guide indicator (e.g. while drawing roads or placing buildings) */}
      {isRoadActive && (
        <div style={activeHintStyle} role="status">
          🛤️ وضع بناء الطريق نشط • اسحب بالمؤشر على الأرض للرسم • اضغط Esc للإلغاء
        </div>
      )}
      {isBuildingActive && (
        <div style={activeHintStyle} role="status">
          🏛️ وضع بناء {activeBuildingName} نشط • انقر على الأرض للتثبيت • اضغط Esc للإلغاء
        </div>
      )}

      {/* Floating Anno detail tooltip */}
      {isOpen && !isRoadActive && !isBuildingActive && <BuildItemTooltip item={hoveredItem} />}

      {/* Toggle Button Anchor */}
      <BuildMenuToggle
        isOpen={isOpen}
        onToggle={toggleOpen}
        activeCount={activeCount}
      />

      {/* Main Anno Construction Dock */}
      {isOpen && (
        <div style={buildMenuStyles.dockShell}>
          <div style={buildMenuStyles.goldTrimLine} aria-hidden="true" />

          {/* Category Ribbon */}
          <BuildCategoryTabs
            activeCategory={activeCategory}
            onSelectCategory={selectCategory}
          />

          {/* Building Cards Tray */}
          <BuildItemGrid
            items={currentCategory.items}
            selectedItemId={selectedItemId}
            onSelectItem={selectItem}
            onHoverItem={setHoveredItem}
            onLeaveItem={() => setHoveredItem(null)}
          />
        </div>
      )}
    </aside>
  )
}
