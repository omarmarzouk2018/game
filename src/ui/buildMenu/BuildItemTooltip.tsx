/**
 * @file BuildItemTooltip.tsx
 * Anno-styled floating information card for building items.
 * Displays lore, construction requirements, maintenance costs, and building dimensions.
 */

import type { CSSProperties } from 'react'
import type { BuildItem } from './buildMenuData'
import { buildMenuTheme } from './buildMenuTheme'

export interface BuildItemTooltipProps {
  readonly item: BuildItem | null
}

export function BuildItemTooltip({ item }: BuildItemTooltipProps) {
  if (!item) return null

  const tooltipStyle: CSSProperties = {
    position: 'absolute',
    bottom: 'calc(100% + 0.65rem)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '280px',
    background: buildMenuTheme.colors.bgElevated,
    border: `1.5px solid ${buildMenuTheme.colors.goldPrimary}`,
    borderRadius: '0.65rem',
    boxShadow: buildMenuTheme.shadows.tooltip,
    padding: '0.8rem 0.95rem',
    direction: 'rtl',
    fontFamily: buildMenuTheme.fonts.ui,
    pointerEvents: 'none',
    zIndex: 30,
    animation: 'annoTooltipFadeIn 180ms ease',
  }

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    borderBottom: `1px solid ${buildMenuTheme.colors.borderSubtle}`,
    paddingBottom: '0.5rem',
    marginBottom: '0.55rem',
  }

  const iconStyle: CSSProperties = {
    fontSize: '1.4rem',
    filter: 'drop-shadow(0 0 4px #dfb358)',
  }

  const titleStyle: CSSProperties = {
    fontSize: '0.96rem',
    fontWeight: 700,
    color: buildMenuTheme.colors.goldLight,
  }

  const badgeStyle: CSSProperties = {
    marginInlineStart: 'auto',
    fontSize: '0.68rem',
    padding: '0.15rem 0.4rem',
    borderRadius: '0.3rem',
    background: 'rgba(0, 0, 0, 0.4)',
    color: buildMenuTheme.colors.textMuted,
    border: `1px solid ${buildMenuTheme.colors.borderSubtle}`,
  }

  const descStyle: CSSProperties = {
    fontSize: '0.8rem',
    lineHeight: 1.45,
    color: buildMenuTheme.colors.textSecondary,
    marginBottom: '0.65rem',
  }

  const statsRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.35rem 0.5rem',
    background: 'rgba(0, 0, 0, 0.35)',
    borderRadius: '0.4rem',
    fontSize: '0.78rem',
    marginBottom: '0.4rem',
  }

  const costGroupStyle: CSSProperties = {
    display: 'flex',
    gap: '0.5rem',
    fontWeight: 600,
  }

  const footerStatusStyle: CSSProperties = {
    fontSize: '0.72rem',
    color: item.isAvailable
      ? buildMenuTheme.colors.statusSuccess
      : buildMenuTheme.colors.statusWarning,
    fontWeight: 600,
    textAlign: 'center',
    paddingTop: '0.25rem',
  }

  return (
    <aside style={tooltipStyle} role="tooltip" aria-hidden="false">
      {item.image && (
        <div
          style={{
            width: '100%',
            height: '115px',
            borderRadius: '0.45rem',
            overflow: 'hidden',
            marginBottom: '0.65rem',
            border: `1px solid ${buildMenuTheme.colors.borderSubtle}`,
            background: 'rgba(0, 0, 0, 0.45)',
          }}
        >
          <img
            src={item.image}
            alt={item.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      )}

      <div style={headerStyle}>
        <span style={iconStyle} aria-hidden="true">
          {item.icon}
        </span>
        <div>
          <div style={titleStyle}>{item.name}</div>
        </div>
        {item.dimensions && (
          <span style={badgeStyle}>المساحة: {item.dimensions}</span>
        )}
      </div>

      <p style={descStyle}>{item.description}</p>

      <div style={statsRowStyle}>
        <span style={{ color: buildMenuTheme.colors.textMuted }}>تكلفة الإنشاء:</span>
        <div style={costGroupStyle}>
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
          {item.cost.stone !== undefined && (
            <span style={{ color: buildMenuTheme.colors.stoneGray }}>
              🪨 {item.cost.stone}
            </span>
          )}
          {item.cost.gold === undefined &&
            item.cost.wood === undefined &&
            item.cost.stone === undefined && (
              <span style={{ color: buildMenuTheme.colors.textMuted }}>بدون تكلفة</span>
            )}
        </div>
      </div>

      <div style={statsRowStyle}>
        <span style={{ color: buildMenuTheme.colors.textMuted }}>الصيانة الدورية:</span>
        <span style={{ color: buildMenuTheme.colors.coinGold, fontWeight: 600 }}>
          {item.maintenance > 0 ? `${item.maintenance} 🪙 / دقيقة` : 'بدون صيانة'}
        </span>
      </div>

      <div style={footerStatusStyle}>
        {item.isAvailable
          ? '✓ جاهز للتشييد (انقر لتفعيل أداة البناء)'
          : `🔒 ${item.unlockRequirement || 'غير متاح حالياً'}`}
      </div>
    </aside>
  )
}
