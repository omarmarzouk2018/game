import * as THREE from 'three'
import rockDocument from '../../assets/environment/rock-09/rock-09.gltf?raw'
import rockBufferUrl from '../../assets/environment/rock-09/rock_09.bin?url'
import rockNormalUrl from '../../assets/environment/rock-09/textures/rock_09_nor_gl_1k.jpg?url'
import rockDiffuseUrl from '../../assets/environment/rock-09/textures/rock_09_diff_1k.jpg?url'
import rockArmUrl from '../../assets/environment/rock-09/textures/rock_09_arm_1k.jpg?url'
import {
  ROCK_MODEL_VARIANTS,
  type RockModelVariant,
} from './rockModelData'
import {
  hash2D,
  sampleIslandTerrain,
  sampleTerrainNormal,
  sampleTerrainSlope,
  type IslandTerrain,
} from './terrain'

/**
 * Creates rock buffer geometry from predefined rock variant models.
 */
export function createRockGeometry(variant = 0, scale = 1.0): THREE.BufferGeometry {
  const modelData: RockModelVariant = ROCK_MODEL_VARIANTS[Math.abs(variant) % ROCK_MODEL_VARIANTS.length]
  const geometry = new THREE.BufferGeometry()

  const positions = new Float32Array(modelData.positions.length)
  if (scale === 1.0) {
    positions.set(modelData.positions)
  } else {
    for (let i = 0; i < modelData.positions.length; i += 1) {
      positions[i] = modelData.positions[i] * scale
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(modelData.normals), 3))
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(modelData.indices), 1))

  return geometry
}

/**
 * Calculates rock placement locations across cliffs and shorelines based on height and slope.
 */
export function createRockPlacements(terrain: IslandTerrain): Array<[number, number]> {
  const placements: Array<[number, number]> = []
  // Natural spacing for coastal boulders and mountain crags without overcrowding
  const step = 5.2
  const halfW = terrain.width / 2 - 5
  const halfD = terrain.depth / 2 - 5

  for (let gz = -halfD; gz <= halfD; gz += step) {
    for (let gx = -halfW; gx <= halfW; gx += step) {
      const ix = Math.round(gx * 10)
      const iz = Math.round(gz * 10)
      const jx = hash2D(ix, iz, 10291) * (step * 0.38)
      const jz = hash2D(ix, iz, 88219) * (step * 0.38)
      const x = gx + jx
      const z = gz + jz

      const sample = sampleIslandTerrain(terrain, x, z)
      if (!sample.land || sample.height <= 0.92) {
        continue
      }

      // Keep the front beach and sandy shorelines completely clean of rocks
      const normalizedX = x / (terrain.width / 2)
      const normalizedZ = z / (terrain.depth / 2)
      const isFrontBeachZone = normalizedZ < -0.02 && Math.abs(normalizedX) < 0.68 && sample.height < 3.6
      if (isFrontBeachZone) {
        continue
      }

      const slope = sampleTerrainSlope(terrain, x, z)
      // Coastal rocks on rocky cliff shores
      const isShore = slope >= 15.0 && sample.height >= 0.95 && sample.height <= 1.45
      // Mountain cliffs and steep coastal palisades across all elevations up to 50m
      const isCliff = slope >= 20.0 && sample.height > 1.45 && sample.height <= 50.0

      if (isShore) {
        const shoreHash = hash2D(ix, iz, 33461)
        if (shoreHash > -0.45) {
          placements.push([x, z])
        }
      } else if (isCliff) {
        const cliffHash = hash2D(ix, iz, 66723)
        // High density of 3D mountain rocks across all steep slopes so crags replace flat colored polygons
        const threshold = slope >= 28.0 ? -0.25 : 0.05
        if (cliffHash > threshold) {
          placements.push([x, z])
        }
      }
    }
  }

  return placements
}

/**
 * Populates instanced rock meshes across cliff edges and shoreline positions.
 */
export function addRocks(
  scene: THREE.Scene,
  terrain: IslandTerrain,
  resources: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
): THREE.InstancedMesh[] {
  const placements = createRockPlacements(terrain)
  if (placements.length === 0) return []

  const createdMeshes: THREE.InstancedMesh[] = []
  const variantCount = ROCK_MODEL_VARIANTS.length
  const variantPlacements: Array<Array<[number, number]>> = Array.from({ length: variantCount }, () => [])
  for (let i = 0; i < placements.length; i += 1) {
    variantPlacements[i % variantCount].push(placements[i])
  }

  const rockPalette = [
    0x6e706c, // weathered granite slate
    0x7b7d76, // rocky cliff grey
    0x5e605d, // dark basalt
    0x757870, // crag limestone
  ]

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scaleVec = new THREE.Vector3()
  const euler = new THREE.Euler()

  for (let v = 0; v < variantCount; v += 1) {
    const instances = variantPlacements[v]
    if (instances.length === 0) continue

    const geometry = createRockGeometry(v)
    resources.add(geometry)

    const material = new THREE.MeshStandardMaterial({
      color: rockPalette[v % rockPalette.length],
      roughness: 0.88,
      metalness: 0.06,
      flatShading: true,
    })
    resources.add(material)

    const instancedMesh = new THREE.InstancedMesh(geometry, material, instances.length)
    instancedMesh.name = `Rock_Variant_${v}`

    for (let i = 0; i < instances.length; i += 1) {
      const [x, z] = instances[i]
      const sample = sampleIslandTerrain(terrain, x, z)
      const slope = sampleTerrainSlope(terrain, x, z)
      const normal = sampleTerrainNormal(terrain, x, z)
      const ix = Math.round(x * 10)
      const iz = Math.round(z * 10)

      const isShore = sample.height <= 1.45
      // Scale rocks prominently on steep slopes to form physical 3D mountain cliffs
      const baseScale = isShore ? 1.4 : 3.4 + Math.min(2.4, (slope - 20.0) * 0.1)
      const s = baseScale * (0.82 + (hash2D(ix, iz, 1493) * 0.5 + 0.5) * 0.36)

      const embedOffset = isShore ? 0.12 * s : 0.22 * s
      position.set(x, sample.height - embedOffset, z)

      if (isShore || slope < 20.0) {
        const yaw = (hash2D(ix, iz, 8831) + 1) * Math.PI
        const pitch = hash2D(ix, iz, 5521) * 0.22
        const roll = hash2D(ix, iz, 7719) * 0.22
        euler.set(pitch, yaw, roll, 'YXZ')
        rotation.setFromEuler(euler)
      } else {
        // Orient and tilt 3D cliff rocks along the mountain slope normal
        const slopeAngle = (slope * Math.PI) / 180
        const yaw = Math.atan2(normal.nx, normal.nz) + hash2D(ix, iz, 8831) * 0.35
        const pitch = slopeAngle * 0.6 + hash2D(ix, iz, 5521) * 0.15
        const roll = hash2D(ix, iz, 7719) * 0.2
        euler.set(pitch, yaw, roll, 'YXZ')
        rotation.setFromEuler(euler)
      }

      scaleVec.set(
        s * (0.9 + (hash2D(ix, iz, 4423) * 0.5 + 0.5) * 0.25),
        s * (0.8 + (hash2D(ix, iz, 9917) * 0.5 + 0.5) * 0.4),
        s * (0.9 + (hash2D(ix, iz, 2213) * 0.5 + 0.5) * 0.25),
      )
      matrix.compose(position, rotation, scaleVec)
      instancedMesh.setMatrixAt(i, matrix)
    }

    instancedMesh.instanceMatrix.needsUpdate = true
    instancedMesh.castShadow = true
    instancedMesh.receiveShadow = true
    scene.add(instancedMesh)
    createdMeshes.push(instancedMesh)
  }

  return createdMeshes
}

/**
 * Rewrites relative paths in the glTF document to point to resolved Vite asset URLs.
 */
export function rewriteRockDocument(jsonDocument: string): string {
  const absoluteUrl = (url: string) => new URL(url, window.document.baseURI).href
  return jsonDocument
    .replace(/("uri"\s*:\s*)"textures\/rock_09_nor_gl_1k\.jpg"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockNormalUrl)}"`)
    .replace(/("uri"\s*:\s*)"textures\/rock_09_diff_1k\.jpg"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockDiffuseUrl)}"`)
    .replace(/("uri"\s*:\s*)"textures\/rock_09_arm_1k\.jpg"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockArmUrl)}"`)
    .replace(/("uri"\s*:\s*)"rock_09\.bin"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockBufferUrl)}"`)
}

/**
 * Generates an object URL for the rewritten rock glTF document.
 */
export function localRockDocumentUrl(): string {
  const document = rewriteRockDocument(rockDocument)
  return URL.createObjectURL(new Blob([document], { type: 'model/gltf+json' }))
}
