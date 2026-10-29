/**
 * @file BuildItemGrid.tsx
 * Tray/Grid component displaying building cards for the active category.
 * Fully responsive and supports keyboard and mouse navigation.
 */

import type { CSSProperties } from 'react'
import type { BuildItem } from './buildMenuData'
import { BuildItemCard } from './BuildItemCard'

export interface BuildItemGridProps {
  readonly items: readonly BuildItem[]
  readonly selectedItemId: string | null
  readonly onSelectItem: (item: BuildItem) => void
  readonly onHoverItem: (item: BuildItem) => void
  readonly onLeaveItem: () => void
}

export function BuildItemGrid({
  items,
  selectedItemId,
  onSelectItem,
  onHoverItem,
  onLeaveItem,
}: BuildItemGridProps) {
  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
    padding: '0.75rem 1rem',
    overflowX: 'auto',
    overflowY: 'hidden',
    maxWidth: '100%',
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(223, 179, 88, 0.4) transparent',
  }

  return (
    <div
      style={containerStyle}
      role="region"
      aria-label="قائمة المباني المتاحة"
    >
      {items.map((item) => (
        <BuildItemCard
          key={item.id}
          item={item}
          isSelected={selectedItemId === item.id}
          onSelect={onSelectItem}
          onHover={onHoverItem}
          onLeave={onLeaveItem}
        />
      ))}
    </div>
  )
}
