import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { createIslandTerrain } from '../game/island/terrain'
import { EconomyManager } from '../game/economy/EconomyManager'
import { RoadNetwork } from '../game/roads/RoadNetwork'
import { RoadBuilder } from '../game/roads/RoadBuilder'
import { RoadToolbar } from './RoadToolbar'

afterEach(() => {
  cleanup()
})

describe('RoadToolbar Component', () => {
  const terrain = createIslandTerrain(41723)

  it('renders road tool button with cost info', () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)

    render(<RoadToolbar roadBuilder={builder} />)

    const btn = screen.getByRole('button', { name: /طريق ترابي/i })
    expect(btn).toBeDefined()
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('toggles builder activation when clicked', () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)

    render(<RoadToolbar roadBuilder={builder} />)

    const btn = screen.getByRole('button', { name: /طريق ترابي/i })
    fireEvent.click(btn)

    expect(builder.isActive()).toBe(true)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('status').textContent).toContain('اسحب بالمؤشر')

    fireEvent.click(btn)
    expect(builder.isActive()).toBe(false)
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('deactivates tool on Escape key', () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)

    render(<RoadToolbar roadBuilder={builder} />)

    act(() => {
      builder.activate('dirt')
    })
    expect(builder.isActive()).toBe(true)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(builder.isActive()).toBe(false)
  })
})
