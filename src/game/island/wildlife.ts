import * as THREE from 'three'
import { sampleIslandTerrain, type IslandTerrain } from './terrain'

/**
 * Calculates deterministic placement coordinates for land animals in natural clusters.
 */
export function createAnimalPlacements(terrain: IslandTerrain): Array<[number, number]> {
  const placements: Array<[number, number]> = []
  const centers: Array<[number, number]> = [
    [-18, 12],
    [22, -15],
    [-12, -22],
    [25, 20],
  ]

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
 * Checks whether an Object3D is an overly heavy placeholder (such as a 50k-triangle tree)
 * rather than a lightweight game entity.
 */
function isHeavyPlaceholder(obj: THREE.Object3D): boolean {
  let vertexCount = 0
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      vertexCount += child.geometry.attributes.position?.count ?? 0
    }
  })
  return vertexCount > 1000
}

/**
 * Creates a lightweight, stylized low-poly deer/animal model (~72 triangles).
 * Avoids cloning heavy 55,000-triangle tree meshes into the scene.
 */
export function createAnimalModel(
  resources?: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
): THREE.Object3D {
  const group = new THREE.Group()
  group.name = 'LowPolyAnimal'

  // Warm chestnut coat
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x855431,
    roughness: 0.82,
    metalness: 0.05,
    flatShading: true,
  })
  resources?.add(bodyMaterial)

  // Torso
  const bodyGeo = new THREE.BoxGeometry(0.7, 0.55, 1.2)
  resources?.add(bodyGeo)
  const body = new THREE.Mesh(bodyGeo, bodyMaterial)
  body.position.set(0, 0.7, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Neck and head
  const headGeo = new THREE.BoxGeometry(0.35, 0.45, 0.5)
  resources?.add(headGeo)
  const head = new THREE.Mesh(headGeo, bodyMaterial)
  head.position.set(0, 1.1, 0.5)
  head.castShadow = true
  head.receiveShadow = true
  group.add(head)

  // Slender legs
  const legGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12)
  resources?.add(legGeo)
  const legPositions: Array<[number, number, number]> = [
    [-0.22, 0.3, 0.38],
    [0.22, 0.3, 0.38],
    [-0.22, 0.3, -0.38],
    [0.22, 0.3, -0.38],
  ]

  for (const [lx, ly, lz] of legPositions) {
    const leg = new THREE.Mesh(legGeo, bodyMaterial)
    leg.position.set(lx, ly, lz)
    leg.castShadow = true
    leg.receiveShadow = true
    group.add(leg)
  }

  return group
}

/**
 * Creates a lightweight low-poly seagull model (~16 triangles).
 * Flies overhead without triggering expensive shadow map render passes.
 */
export function createBirdModel(
  resources?: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
): THREE.Object3D {
  const group = new THREE.Group()
  group.name = 'LowPolyBird'

  const birdMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5f7fa,
    roughness: 0.55,
    metalness: 0.05,
    flatShading: true,
  })
  resources?.add(birdMaterial)

  // Aerodynamic body
  const bodyGeo = new THREE.ConeGeometry(0.18, 0.85, 4)
  bodyGeo.rotateX(Math.PI / 2)
  resources?.add(bodyGeo)
  const body = new THREE.Mesh(bodyGeo, birdMaterial)
  group.add(body)

  // Gull wings with dihedral angle
  const wingGeo = new THREE.BufferGeometry()
  const wingPositions = new Float32Array([
    0, 0, 0.1,
    -1.1, 0.16, -0.15,
    0, 0, -0.22,

    0, 0, 0.1,
    0, 0, -0.22,
    1.1, 0.16, -0.15,
  ])
  wingGeo.setAttribute('position', new THREE.BufferAttribute(wingPositions, 3))
  wingGeo.computeVertexNormals()
  resources?.add(wingGeo)

  const wingMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e7ec,
    roughness: 0.6,
    metalness: 0.05,
    side: THREE.DoubleSide,
    flatShading: true,
  })
  resources?.add(wingMaterial)
  const wings = new THREE.Mesh(wingGeo, wingMaterial)
  group.add(wings)

  // Golden-yellow beak
  const beakGeo = new THREE.ConeGeometry(0.05, 0.22, 3)
  beakGeo.rotateX(Math.PI / 2)
  resources?.add(beakGeo)
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xdf8a28, roughness: 0.7 })
  resources?.add(beakMat)
  const beak = new THREE.Mesh(beakGeo, beakMat)
  beak.position.set(0, 0, 0.5)
  group.add(beak)

  return group
}

/**
 * Instantiates land animals across fertile terrain with subtle grazing animations.
 */
export function addAnimals(
  scene: THREE.Scene,
  terrain: IslandTerrain,
  modelTemplate?: THREE.Object3D,
  resources?: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
): (time: number) => void {
  const placements = createAnimalPlacements(terrain)
  if (placements.length === 0) return () => {}

  // Use dedicated low-poly animal model if template is omitted or a heavy placeholder
  const effectiveTemplate =
    modelTemplate && !isHeavyPlaceholder(modelTemplate)
      ? modelTemplate
      : createAnimalModel(resources)

  const animals: THREE.Object3D[] = []

  placements.forEach(([x, z], index) => {
    const sample = sampleIslandTerrain(terrain, x, z)
    const animal = effectiveTemplate.clone(true)
    animal.scale.set(0.85, 0.85, 0.85)
    animal.position.set(x, sample.height, z)
    animal.rotation.y = index * 1.57

    animal.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (resources) {
          resources.add(child.geometry)
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach((m) => resources.add(m))
        }
      }
    })

    scene.add(animal)
    animals.push(animal)
  })

  const animate = (time: number) => {
    animals.forEach((animal, i) => {
      const bob = Math.sin(time * 3.0 + i * 1.7) * 0.04
      animal.position.y += bob * 0.005
    })
  }

  return Object.assign(animate, { animals })
}

/**
 * Spawns soaring birds in graceful circular orbits above the island.
 * Birds do not cast shadows to minimize shadow map render pass overhead.
 */
export function addBirds(
  scene: THREE.Scene,
  modelTemplate?: THREE.Object3D,
  resources?: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
): (time: number) => void {
  const birdCount = 10
  const birds: THREE.Object3D[] = []

  // Use dedicated low-poly bird model if template is omitted or a heavy placeholder
  const effectiveTemplate =
    modelTemplate && !isHeavyPlaceholder(modelTemplate)
      ? modelTemplate
      : createBirdModel(resources)

  for (let i = 0; i < birdCount; i++) {
    const bird = effectiveTemplate.clone(true)
    bird.scale.set(0.7, 0.7, 0.7)

    // Optimization: Flying birds high in the sky don't cast terrain shadows
    bird.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false
        child.receiveShadow = false
        if (resources) {
          resources.add(child.geometry)
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach((m) => resources.add(m))
        }
      }
    })

    scene.add(bird)
    birds.push(bird)
  }

  const animate = (time: number) => {
    birds.forEach((bird, i) => {
      const angle = time * 0.35 + i * ((Math.PI * 2) / birdCount)
      const radius = 70 + Math.sin(time * 0.2 + i) * 15
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = 36 + Math.sin(time * 0.8 + i * 2) * 6

      bird.position.set(x, y, z)
      bird.rotation.y = -angle + Math.PI / 2
      bird.rotation.z = Math.sin(time * 8.0 + i * 1.5) * 0.12
    })
  }

  return Object.assign(animate, { birds })
}
