/**
 * @file buildMenuTheme.ts
 * Design system tokens and style objects for the Anno-style construction interface.
 * Implements styling as React CSSProperties instead of external CSS files, as requested.
 */

import type { CSSProperties } from 'react'

export const buildMenuTheme = {
  colors: {
    bgBase: 'rgba(12, 22, 34, 0.96)',
    bgSurface: 'rgba(18, 32, 48, 0.92)',
    bgElevated: 'rgba(25, 43, 64, 0.95)',
    bgSubtle: 'rgba(30, 52, 78, 0.70)',
    bgHover: 'rgba(42, 69, 102, 0.85)',
    bgActive: 'rgba(56, 88, 128, 0.95)',
    bgDisabled: 'rgba(14, 20, 28, 0.75)',

    // Anno Gold & Brass Palette
    goldPrimary: '#dfb358',
    goldLight: '#f6d88c',
    goldDark: '#9c7329',
    goldMuted: '#bfa063',
    goldGlow: 'rgba(223, 179, 88, 0.45)',

    // Borders & Dividers
    borderOrnate: '#a67c2e',
    borderSubtle: 'rgba(166, 124, 46, 0.40)',
    borderFocus: '#f4ce75',

    // Typography
    textPrimary: '#f7f1e5',
    textSecondary: '#c8d4df',
    textMuted: '#8b9bb0',
    textDisabled: '#5c6978',

    // Status & Costs
    coinGold: '#f7d56e',
    woodBrown: '#df9c64',
    stoneGray: '#c2cad4',
    statusSuccess: '#3cd070',
    statusWarning: '#e67e22',
  },

  shadows: {
    dock: '0 16px 36px rgba(0, 0, 0, 0.65), 0 4px 12px rgba(0, 0, 0, 0.50), inset 0 1px 1px rgba(246, 216, 140, 0.35)',
    card: '0 4px 12px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
    cardHover: '0 8px 20px rgba(0, 0, 0, 0.55), 0 0 12px rgba(223, 179, 88, 0.35)',
    cardActive: '0 0 16px rgba(246, 216, 140, 0.65), inset 0 0 8px rgba(223, 179, 88, 0.40)',
    tooltip: '0 12px 28px rgba(0, 0, 0, 0.70), 0 0 1px 1px rgba(223, 179, 88, 0.50)',
  },

  transitions: {
    fast: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: 'all 220ms cubic-bezier(0.4, 0, 0.2, 1)',
  },

  fonts: {
    ui: `'Segoe UI', 'Noto Sans Arabic', system-ui, -apple-system, sans-serif`,
  },
} as const

/**
 * Common style compositions for Anno-like UI elements.
 */
export const buildMenuStyles = {
  container: {
    position: 'absolute',
    bottom: '0.85rem',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    direction: 'rtl',
    fontFamily: buildMenuTheme.fonts.ui,
    userSelect: 'none',
    pointerEvents: 'auto',
    maxWidth: 'calc(100vw - 2rem)',
  } as CSSProperties,

  dockShell: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: buildMenuTheme.colors.bgBase,
    border: `1.5px solid ${buildMenuTheme.colors.borderOrnate}`,
    borderRadius: '0.85rem',
    boxShadow: buildMenuTheme.shadows.dock,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    overflow: 'hidden',
    transition: buildMenuTheme.transitions.normal,
  } as CSSProperties,

  goldTrimLine: {
    position: 'absolute',
    top: 0,
    left: '5%',
    right: '5%',
    height: '1px',
    background: `linear-gradient(90deg, transparent 0%, ${buildMenuTheme.colors.goldLight} 50%, transparent 100%)`,
    pointerEvents: 'none',
  } as CSSProperties,
}
