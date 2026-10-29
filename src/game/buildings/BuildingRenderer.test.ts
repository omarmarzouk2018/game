import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createIslandTerrain } from '../island/terrain'
import { EconomyManager } from '../economy/EconomyManager'
import { RoadNetwork } from '../roads/RoadNetwork'
import { BuildingManager } from './BuildingManager'
import { BuildingValidator } from './BuildingValidator'
import { BuildingPlacement } from './BuildingPlacement'
import { BuildingRenderer } from './BuildingRenderer'
import { BUILDING_DEFINITIONS } from './BuildingTypes'

describe('BuildingRenderer', () => {
  const terrain = createIslandTerrain(41723)
  const def = BUILDING_DEFINITIONS.pioneer_cottage

  it('renders a translucent blueprint ghost when building tool is active and hovering', () => {
    const scene = new THREE.Scene()
    const economy = new EconomyManager(500)
    const roadNetwork = new RoadNetwork()
    const buildingManager = new BuildingManager()
    const validator = new BuildingValidator()
    const placement = new BuildingPlacement(terrain, buildingManager, roadNetwork, economy, validator)
    const renderer = new BuildingRenderer(scene, terrain, buildingManager, placement)

    expect(scene.getObjectByName('BuildingBlueprint')?.children.length).toBe(0)

    placement.activate(def)
    placement.updateHover(0, 0)

    const blueprintGroup = scene.getObjectByName('BuildingBlueprint')
    expect(blueprintGroup?.children.length).toBeGreaterThan(0)

    // Check blueprint has footprint and volume
    const ghost = blueprintGroup?.children[0]
    expect(ghost?.name).toBe('Blueprint_pioneer_cottage')

    // Deactivating clears blueprint
    placement.deactivate()
    expect(blueprintGroup?.children.length).toBe(0)

    renderer.dispose()
  })

  it('renders placed buildings in the scene', () => {
    const scene = new THREE.Scene()
    const economy = new EconomyManager(500)
    const roadNetwork = new RoadNetwork()
    const buildingManager = new BuildingManager()
    const validator = new BuildingValidator()
    const placement = new BuildingPlacement(terrain, buildingManager, roadNetwork, economy, validator)
    const renderer = new BuildingRenderer(scene, terrain, buildingManager, placement)

    const placedGroup = scene.getObjectByName('PlacedBuildings')
    expect(placedGroup?.children.length).toBe(0)

    buildingManager.placeBuilding(def, 0, 0, 2.5)
    expect(placedGroup?.children.length).toBe(1)

    renderer.dispose()
  })
})
