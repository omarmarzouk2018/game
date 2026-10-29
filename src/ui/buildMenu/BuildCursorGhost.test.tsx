import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { createIslandTerrain } from '../../game/island/terrain'
import { EconomyManager } from '../../game/economy/EconomyManager'
import { RoadNetwork } from '../../game/roads/RoadNetwork'
import { RoadBuilder } from '../../game/roads/RoadBuilder'
import { BuildingManager } from '../../game/buildings/BuildingManager'
import { BuildingValidator } from '../../game/buildings/BuildingValidator'
import { BuildingPlacement } from '../../game/buildings/BuildingPlacement'
import { BUILDING_DEFINITIONS } from '../../game/buildings/BuildingTypes'
import { BuildCursorGhost } from './BuildCursorGhost'

afterEach(() => {
  cleanup()
})

describe('BuildCursorGhost Component', () => {
  const terrain = createIslandTerrain(41723)

  const setupServices = () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const roadBuilder = new RoadBuilder(terrain, roadNetwork, economy)
    const buildingManager = new BuildingManager()
    const validator = new BuildingValidator()
    const buildingPlacement = new BuildingPlacement(
      terrain,
      buildingManager,
      roadNetwork,
      economy,
      validator,
    )
    return { roadBuilder, buildingPlacement }
  }

  it('renders nothing when no tool is active', () => {
    const { roadBuilder, buildingPlacement } = setupServices()
    const { container } = render(
      <BuildCursorGhost roadBuilder={roadBuilder} buildingPlacement={buildingPlacement} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders translucent road badge at cursor when road tool is activated and pointer moves', () => {
    const { roadBuilder, buildingPlacement } = setupServices()
    render(<BuildCursorGhost roadBuilder={roadBuilder} buildingPlacement={buildingPlacement} />)

    act(() => {
      roadBuilder.activate('dirt')
      fireEvent(
        window,
        new PointerEvent('pointermove', {
          clientX: 200,
          clientY: 300,
        }),
      )
    })

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/طريق ترابي/i)).toBeInTheDocument()
    expect(screen.getByText(/5 🪙/i)).toBeInTheDocument()
  })

  it('renders translucent building badge when building is selected', () => {
    const { roadBuilder, buildingPlacement } = setupServices()
    render(<BuildCursorGhost roadBuilder={roadBuilder} buildingPlacement={buildingPlacement} />)

    act(() => {
      buildingPlacement.activate(BUILDING_DEFINITIONS.pioneer_cottage)
      fireEvent(
        window,
        new PointerEvent('pointermove', {
          clientX: 150,
          clientY: 250,
        }),
      )
    })

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(BUILDING_DEFINITIONS.pioneer_cottage.name, 'i'))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${BUILDING_DEFINITIONS.pioneer_cottage.cost.gold} 🪙`, 'i'))).toBeInTheDocument()
  })
})
