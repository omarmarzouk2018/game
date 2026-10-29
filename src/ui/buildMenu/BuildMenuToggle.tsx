/**
 * @file BuildMenuToggle.tsx
 * Anno-styled ornate toggle button to collapse or expand the bottom build menu.
 * Built using React component inline styling without external CSS dependencies.
 */

import { type CSSProperties, useState } from 'react'
import { buildMenuTheme } from './buildMenuTheme'

export interface BuildMenuToggleProps {
  readonly isOpen: boolean
  readonly onToggle: () => void
  readonly activeCount?: number
}

export function BuildMenuToggle({
  isOpen,
  onToggle,
  activeCount = 0,
}: BuildMenuToggleProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  const buttonStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
    padding: '0.55rem 1.25rem',
    background: isOpen
      ? `linear-gradient(180deg, ${buildMenuTheme.colors.bgElevated} 0%, ${buildMenuTheme.colors.bgBase} 100%)`
      : `linear-gradient(180deg, #18283a 0%, #0d1722 100%)`,
    border: `1.5px solid ${
      isHovered || isFocused || isOpen
        ? buildMenuTheme.colors.goldLight
        : buildMenuTheme.colors.borderOrnate
    }`,
    borderRadius: isOpen ? '0.75rem 0.75rem 0 0' : '0.75rem',
    color: buildMenuTheme.colors.textPrimary,
    fontFamily: buildMenuTheme.fonts.ui,
    fontSize: '0.92rem',
    fontWeight: 700,
    cursor: 'pointer',
    outline: 'none',
    boxShadow: isOpen
      ? `0 -4px 16px rgba(0, 0, 0, 0.4), 0 0 14px ${buildMenuTheme.colors.goldGlow}`
      : isHovered
      ? `0 6px 18px rgba(0, 0, 0, 0.45), 0 0 10px ${buildMenuTheme.colors.goldGlow}`
      : '0 4px 12px rgba(0, 0, 0, 0.35)',
    transition: buildMenuTheme.transitions.fast,
    transform: isHovered && !isOpen ? 'translateY(-2px)' : 'none',
  }

  const iconStyle: CSSProperties = {
    fontSize: '1.2rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    filter: isOpen ? 'drop-shadow(0 0 4px #dfb358)' : 'none',
  }

  const badgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.15rem 0.45rem',
    background: 'rgba(0, 0, 0, 0.45)',
    border: `1px solid ${buildMenuTheme.colors.borderSubtle}`,
    borderRadius: '0.35rem',
    fontSize: '0.75rem',
    color: buildMenuTheme.colors.goldLight,
    fontWeight: 600,
    letterSpacing: '0.5px',
  }

  const arrowStyle: CSSProperties = {
    fontSize: '0.8rem',
    color: buildMenuTheme.colors.goldPrimary,
    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: buildMenuTheme.transitions.fast,
    marginInlineStart: '0.2rem',
  }

  return (
    <button
      type="button"
      style={buttonStyle}
      onClick={onToggle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      aria-expanded={isOpen}
      aria-label="قائمة البناء وتطوير المدينة"
      title="فتح أو إغلاق قائمة البناء (مفتاح B)"
    >
      <span style={iconStyle} aria-hidden="true">
        🏛️
      </span>
      <span>قائمة البناء</span>
      <span style={badgeStyle} title="اختصار لوحة المفاتيح">B</span>
      {activeCount > 0 && (
        <span
          style={{
            ...badgeStyle,
            background: buildMenuTheme.colors.goldDark,
            color: '#fff',
          }}
        >
          {activeCount} نشط
        </span>
      )}
      <span style={arrowStyle} aria-hidden="true">
        ▲
      </span>
    </button>
  )
}
