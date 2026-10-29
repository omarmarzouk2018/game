/**
 * @file BuildMenu.test.tsx
 * Comprehensive unit and integration tests for the Anno-style Build Menu.
 */

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createIslandTerrain } from '../../game/island/terrain'
import { EconomyManager } from '../../game/economy/EconomyManager'
import { RoadNetwork } from '../../game/roads/RoadNetwork'
import { RoadBuilder } from '../../game/roads/RoadBuilder'
import { BuildMenu } from './BuildMenu'

afterEach(() => {
  cleanup()
})

describe('BuildMenu Component (Anno-style)', () => {
  const terrain = createIslandTerrain(41723)

  const setupBuilder = () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)
    return { builder, economy, roadNetwork }
  }

  it('renders the build menu toolbar and category tabs by default', () => {
    const { builder } = setupBuilder()
    render(<BuildMenu roadBuilder={builder} initialOpen={true} />)

    expect(screen.getByRole('toolbar', { name: /شريط بناء المستوطنة/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /قائمة البناء/i })).toBeInTheDocument()

    // Check categories tabs
    expect(screen.getByRole('tab', { name: /طرق وبنية تحتية/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /المزارعون والسكن/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /الإنتاج والصناعة/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /الموانئ والتجارة/i })).toBeInTheDocument()
  })

  it('switches categories and displays corresponding items', () => {
    const { builder } = setupBuilder()
    render(<BuildMenu roadBuilder={builder} initialOpen={true} />)

    // Infrastructure by default
    expect(screen.getByRole('button', { name: /طريق ترابي/i })).toBeInTheDocument()

    // Switch to Farmers / Housing
    const farmersTab = screen.getByRole('tab', { name: /المزارعون والسكن/i })
    fireEvent.click(farmersTab)

    expect(screen.getByRole('button', { name: /كوخ المزارعين/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ساحة السوق/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /بئر مياه/i })).toBeInTheDocument()

    // Switch to Industry
    const industryTab = screen.getByRole('tab', { name: /الإنتاج والصناعة/i })
    fireEvent.click(industryTab)
    expect(screen.getByRole('button', { name: /كوخ الحطّاب/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /منشرة الخشب/i })).toBeInTheDocument()
  })

  it('activates road builder when dirt road card is clicked', () => {
    const { builder } = setupBuilder()
    render(<BuildMenu roadBuilder={builder} initialOpen={true} />)

    const roadBtn = screen.getByRole('button', { name: /طريق ترابي/i })
    expect(builder.isActive()).toBe(false)
    expect(roadBtn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(roadBtn)
    expect(builder.isActive()).toBe(true)
    expect(roadBtn.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('status').textContent).toContain('وضع بناء الطريق نشط')

    // Click again to toggle off
    fireEvent.click(roadBtn)
    expect(builder.isActive()).toBe(false)
    expect(roadBtn.getAttribute('aria-pressed')).toBe('false')
  })

  it('toggles menu open and closed with toggle button', () => {
    const { builder } = setupBuilder()
    render(<BuildMenu roadBuilder={builder} initialOpen={true} />)

    const toggleBtn = screen.getByRole('button', { name: /قائمة البناء/i })
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(toggleBtn)
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()

    fireEvent.click(toggleBtn)
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('toggles menu with keyboard key "B"', () => {
    const { builder } = setupBuilder()
    render(<BuildMenu roadBuilder={builder} initialOpen={true} />)

    const toggleBtn = screen.getByRole('button', { name: /قائمة البناء/i })
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(window, { key: 'b' })
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false')

    fireEvent.keyDown(window, { key: 'B' })
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true')
  })

  it('deactivates tool on Escape key', () => {
    const { builder } = setupBuilder()
    render(<BuildMenu roadBuilder={builder} initialOpen={true} />)

    const roadBtn = screen.getByRole('button', { name: /طريق ترابي/i })
    fireEvent.click(roadBtn)
    expect(builder.isActive()).toBe(true)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(builder.isActive()).toBe(false)
  })

  it('displays detailed tooltip on card hover', () => {
    const { builder } = setupBuilder()
    render(<BuildMenu roadBuilder={builder} initialOpen={true} />)

    const roadBtn = screen.getByRole('button', { name: /طريق ترابي/i })
    fireEvent.mouseEnter(roadBtn)

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toBeInTheDocument()
    expect(tooltip.textContent).toContain('طريق ممهّد أساسي')
    expect(tooltip.textContent).toContain('تكلفة الإنشاء')
    expect(tooltip.textContent).toContain('الصيانة الدورية')

    fireEvent.mouseLeave(roadBtn)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('operates safely when roadBuilder is null', () => {
    render(<BuildMenu roadBuilder={null} initialOpen={true} />)

    const roadBtn = screen.getByRole('button', { name: /طريق ترابي/i })
    expect(roadBtn).toBeInTheDocument()
    expect(() => fireEvent.click(roadBtn)).not.toThrow()
  })

  it('renders realistic building image thumbnail when image is available', () => {
    const { builder } = setupBuilder()
    render(<BuildMenu roadBuilder={builder} initialOpen={true} />)

    const roadBtn = screen.getByRole('button', { name: /طريق ترابي/i })
    const img = roadBtn.querySelector('img')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('alt', 'طريق ترابي')
  })
})
