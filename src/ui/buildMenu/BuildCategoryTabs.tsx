/**
 * @file BuildCategoryTabs.tsx
 * Anno-styled horizontal category tabs for construction types.
 * Pure React component with co-located inline styles.
 */

import { type CSSProperties, useState } from 'react'
import {
  BUILD_CATEGORIES,
  type BuildCategoryId,
} from './buildMenuData'
import { buildMenuTheme } from './buildMenuTheme'

export interface BuildCategoryTabsProps {
  readonly activeCategory: BuildCategoryId
  readonly onSelectCategory: (category: BuildCategoryId) => void
}

export function BuildCategoryTabs({
  activeCategory,
  onSelectCategory,
}: BuildCategoryTabsProps) {
  const [hoveredTab, setHoveredTab] = useState<BuildCategoryId | null>(null)

  const navStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    width: '100%',
    padding: '0.45rem 0.75rem 0.35rem',
    borderBottom: `1px solid ${buildMenuTheme.colors.borderSubtle}`,
    background: 'rgba(8, 16, 26, 0.75)',
    overflowX: 'auto',
  }

  return (
    <nav
      style={navStyle}
      role="tablist"
      aria-label="فئات مباني وعناصر البناء"
    >
      {BUILD_CATEGORIES.map((cat) => {
        const isActive = cat.id === activeCategory
        const isHovered = cat.id === hoveredTab

        const tabStyle: CSSProperties = {
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.4rem 0.85rem',
          background: isActive
            ? `linear-gradient(180deg, ${buildMenuTheme.colors.bgElevated} 0%, rgba(20, 36, 56, 0.95) 100%)`
            : isHovered
            ? 'rgba(32, 54, 80, 0.5)'
            : 'transparent',
          border: 'none',
          borderBottom: isActive
            ? `2px solid ${buildMenuTheme.colors.goldPrimary}`
            : '2px solid transparent',
          borderRadius: '0.45rem 0.45rem 0 0',
          color: isActive
            ? buildMenuTheme.colors.goldLight
            : isHovered
            ? buildMenuTheme.colors.textPrimary
            : buildMenuTheme.colors.textSecondary,
          fontFamily: buildMenuTheme.fonts.ui,
          fontSize: '0.85rem',
          fontWeight: isActive ? 700 : 500,
          cursor: 'pointer',
          outline: 'none',
          whiteSpace: 'nowrap',
          transition: buildMenuTheme.transitions.fast,
        }

        const iconStyle: CSSProperties = {
          fontSize: '1.05rem',
          filter: isActive ? 'drop-shadow(0 0 3px #dfb358)' : 'none',
        }

        return (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            style={tabStyle}
            onClick={() => onSelectCategory(cat.id)}
            onMouseEnter={() => setHoveredTab(cat.id)}
            onMouseLeave={() => setHoveredTab(null)}
          >
            <span style={iconStyle} aria-hidden="true">
              {cat.icon}
            </span>
            <span>{cat.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
