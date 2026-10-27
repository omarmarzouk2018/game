import * as THREE from 'three'
import { sampleIslandTerrain, type IslandTerrain } from './terrain'

/**
 * Calculates placement coordinates for land animals in clusters.
 */
export function createAnimalPlacements(terrain: IslandTerrain): Array<[number, number]> {
  const placements: Array<[number, number]> = []
  const centers: Array<[number, number]> = [[-18, 12], [22, -15], [-12, -22], [25, 20]]
  centers.forEach(([centerX, centerZ], idx) => {
    for (let i = 0; i < 3; i++) {
      const angle = i * 2.1 + idx
      const r = 4 + i * 2.5
      const x = centerX + Math.cos(angle) * r
      const z = centerZ + Math.sin(angle) * r
      const sample = sampleIslandTerrain(terrain, x, z)
      if (sample.land && sample.height >= 2.0 && sample.height <= 12.0) {
        placements.push([x, z])
      }
    }
  })
  return placements
}

/**
 * Clones animal model templates at valid terrain coordinates and animates subtle bobbing.
 */
export function addAnimals(
  scene: THREE.Scene,
  terrain: IslandTerrain,
  modelTemplate: THREE.Object3D,
): (time: number) => void {
  const placements = createAnimalPlacements(terrain)
  if (placements.length === 0) return () => {}
  const animals: THREE.Object3D[] = []
  placements.forEach(([x, z], index) => {
    const sample = sampleIslandTerrain(terrain, x, z)
    const animal = modelTemplate.clone(true)
    animal.scale.set(0.12, 0.12, 0.12)
    animal.position.set(x, sample.height, z)
    animal.rotation.y = index * 1.57
    animal.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    scene.add(animal)
    animals.push(animal)
  })
  return (time: number) => {
    animals.forEach((animal, i) => {
      const bob = Math.sin(time * 3.0 + i * 1.7) * 0.05
      animal.position.y += bob * 0.01
    })
  }
}

/**
 * Spawns orbiting birds in the sky above the island.
 */
export function addBirds(
  scene: THREE.Scene,
  modelTemplate: THREE.Object3D,
): (time: number) => void {
  const birdCount = 10
  const birds: THREE.Object3D[] = []
  for (let i = 0; i < birdCount; i++) {
    const bird = modelTemplate.clone(true)
    bird.scale.set(0.06, 0.06, 0.06)
    scene.add(bird)
    birds.push(bird)
  }
  return (time: number) => {
    birds.forEach((bird, i) => {
      const angle = time * 0.4 + i * ((Math.PI * 2) / birdCount)
      const radius = 65 + Math.sin(time * 0.2 + i) * 15
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = 35 + Math.sin(time * 0.8 + i * 2) * 8
      bird.position.set(x, y, z)
      bird.rotation.y = -angle + Math.PI / 2
      bird.rotation.z = Math.sin(time * 12.0 + i * 1.5) * 0.15
    })
  }
}

