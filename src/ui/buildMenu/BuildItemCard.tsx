/**
 * @file BuildItemCard.tsx
 * Individual building card in the Anno construction menu tray.
 * Features ornate gold borders, cost badges, and hover tooltips via React inline styles.
 */

import { type CSSProperties, useState } from 'react'
import type { BuildItem } from './buildMenuData'
import { buildMenuTheme } from './buildMenuTheme'

export interface BuildItemCardProps {
  readonly item: BuildItem
  readonly isSelected: boolean
  readonly onSelect: (item: BuildItem) => void
  readonly onHover: (item: BuildItem) => void
  readonly onLeave: () => void
}

export function BuildItemCard({
  item,
  isSelected,
  onSelect,
  onHover,
  onLeave,
}: BuildItemCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const isInteractive = isHovered || isFocused

  const cardStyle: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '104px',
    height: '122px',
    padding: '0.5rem 0.4rem 0.45rem',
    background: isSelected
      ? `linear-gradient(180deg, ${buildMenuTheme.colors.bgActive} 0%, rgba(20, 38, 58, 0.98) 100%)`
      : isInteractive
      ? `linear-gradient(180deg, ${buildMenuTheme.colors.bgHover} 0%, rgba(18, 32, 48, 0.95) 100%)`
      : `linear-gradient(180deg, ${buildMenuTheme.colors.bgSurface} 0%, rgba(12, 22, 34, 0.95) 100%)`,
    border: isSelected
      ? `2px solid ${buildMenuTheme.colors.goldLight}`
      : isInteractive
      ? `1.5px solid ${buildMenuTheme.colors.goldPrimary}`
      : `1px solid ${buildMenuTheme.colors.borderSubtle}`,
    borderRadius: '0.65rem',
    boxShadow: isSelected
      ? buildMenuTheme.shadows.cardActive
      : isInteractive
      ? buildMenuTheme.shadows.cardHover
      : buildMenuTheme.shadows.card,
    cursor: item.isAvailable ? 'pointer' : 'not-allowed',
    opacity: item.isAvailable ? 1 : 0.65,
    outline: 'none',
    transform: isInteractive && item.isAvailable ? 'translateY(-3px)' : 'none',
    transition: buildMenuTheme.transitions.fast,
    fontFamily: buildMenuTheme.fonts.ui,
    userSelect: 'none',
  }

  const iconContainerStyle: CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '58px',
    height: '58px',
    background: 'rgba(0, 0, 0, 0.45)',
    border: `1px solid ${
      isSelected
        ? buildMenuTheme.colors.goldLight
        : isInteractive
        ? buildMenuTheme.colors.goldPrimary
        : buildMenuTheme.colors.borderSubtle
    }`,
    borderRadius: '0.45rem',
    fontSize: '1.65rem',
    marginTop: '0.1rem',
    overflow: 'hidden',
    boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.6)',
    filter: isSelected ? 'drop-shadow(0 0 6px #f7d56e)' : 'none',
  }

  const imageStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '0.35rem',
    transform: isInteractive ? 'scale(1.08)' : 'scale(1.0)',
    transition: 'transform 200ms ease',
  }

  const nameStyle: CSSProperties = {
    fontSize: '0.74rem',
    fontWeight: 600,
    color: isSelected
      ? buildMenuTheme.colors.goldLight
      : isInteractive
      ? buildMenuTheme.colors.textPrimary
      : buildMenuTheme.colors.textSecondary,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '86px',
    marginTop: '0.2rem',
  }

  const costRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.3rem',
    width: '100%',
    padding: '0.15rem 0.3rem',
    background: 'rgba(0, 0, 0, 0.45)',
    borderRadius: '0.35rem',
    fontSize: '0.68rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  }

  const sizeBadgeStyle: CSSProperties = {
    position: 'absolute',
    top: '3px',
    left: '3px',
    padding: '0.05rem 0.25rem',
    background: 'rgba(0, 0, 0, 0.6)',
    borderRadius: '0.25rem',
    fontSize: '0.62rem',
    color: buildMenuTheme.colors.textMuted,
    fontVariantNumeric: 'tabular-nums',
  }

  const lockBadgeStyle: CSSProperties = {
    position: 'absolute',
    top: '3px',
    right: '3px',
    fontSize: '0.7rem',
  }

  return (
    <button
      type="button"
      style={cardStyle}
      onClick={() => onSelect(item)}
      onMouseEnter={() => {
        setIsHovered(true)
        onHover(item)
      }}
      onMouseLeave={() => {
        setIsHovered(false)
        onLeave()
      }}
      onFocus={() => {
        setIsFocused(true)
        onHover(item)
      }}
      onBlur={() => {
        setIsFocused(false)
        onLeave()
      }}
      aria-pressed={isSelected}
      aria-disabled={!item.isAvailable}
      aria-label={`${item.name}، تكلفة البناء: ${
        item.cost.gold ? `${item.cost.gold} ذهب ` : ''
      }${item.cost.wood ? `${item.cost.wood} خشب` : ''}`}
    >
      {item.dimensions && <span style={sizeBadgeStyle}>{item.dimensions}</span>}
      {!item.isAvailable && (
        <span style={lockBadgeStyle} title={item.unlockRequirement || 'مقفل'}>
          🔒
        </span>
      )}

      <div style={iconContainerStyle}>
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            style={imageStyle}
            loading="lazy"
          />
        ) : (
          <span aria-hidden="true">{item.icon}</span>
        )}
      </div>

      <span style={nameStyle}>{item.name}</span>

      <div style={costRowStyle}>
        {item.cost.gold !== undefined && (
          <span style={{ color: buildMenuTheme.colors.coinGold }}>
            🪙 {item.cost.gold}
          </span>
        )}
        {item.cost.wood !== undefined && (
          <span style={{ color: buildMenuTheme.colors.woodBrown }}>
            🪵 {item.cost.wood}
          </span>
        )}
        {item.cost.gold === undefined && item.cost.wood === undefined && (
          <span style={{ color: buildMenuTheme.colors.textMuted }}>مجاني</span>
        )}
      </div>
    </button>
  )
}
