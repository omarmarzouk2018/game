/**
 * @file RoadGeometry.ts
 * Generates organic, contour-following 3D dirt road meshes with rich junction topologies:
 * - Straight tracks (N-S & E-W) with parallel cart ruts
 * - Curved corners / bends (90° arced fillets)
 * - 3-Way T-Junctions with flared corner fillets
 * - 4-Way Crossroads with central circular turning clearings
 * - Dead-End rounded turnarounds
 * - Crowned 3D cross-sections (wheel ruts -0.032m, center crown ridge +0.016m)
 */

import * as THREE from 'three'
import { sampleIslandTerrain, type IslandTerrain, hash2D } from '../island/terrain'
import { RoadNetwork } from './RoadNetwork'
import {
  type RoadTileCoordinate,
  ROAD_TILE_SIZE,
} from './RoadTypes'

export const ROAD_SURFACE_OFFSET_Y = 0.045 // 4.5 cm above terrain baseline
export const TILE_SUBDIVISIONS = 4 // 4x4 quads (25 vertices per tile)

export type RoadOrientation = 'along-z' | 'along-x' | 'junction'

export type RoadJunctionType =
  | 'isolated'
  | 'dead_end'
  | 'straight'
  | 'corner'
  | 't_junction'
  | 'crossroad'

export interface TileNeighbors {
  readonly hasNorth: boolean
  readonly hasSouth: boolean
  readonly hasEast: boolean
  readonly hasWest: boolean
}

export interface RoadTileTopology {
  readonly junctionType: RoadJunctionType
  readonly orientation: RoadOrientation
  readonly mask: number // 0..15 bitmask
  readonly neighbors: TileNeighbors
  readonly rotation: number // 0, 1, 2, 3 quarter turns
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Checks all 4 cardinal connections for a road tile against an existing network map.
 */
export function getTileNeighbors(
  tile: RoadTileCoordinate,
  allTilesMap: Map<string, RoadTileCoordinate>,
): TileNeighbors {
  return {
    hasNorth: allTilesMap.has(RoadNetwork.tileKey(tile.gridX, tile.gridZ - 1)),
    hasSouth: allTilesMap.has(RoadNetwork.tileKey(tile.gridX, tile.gridZ + 1)),
    hasEast: allTilesMap.has(RoadNetwork.tileKey(tile.gridX + 1, tile.gridZ)),
    hasWest: allTilesMap.has(RoadNetwork.tileKey(tile.gridX - 1, tile.gridZ)),
  }
}

/**
 * Determines classic road travel orientation for backwards compatibility.
 */
export function determineRoadOrientation(neighbors: TileNeighbors): RoadOrientation {
  const countZ = (neighbors.hasNorth ? 1 : 0) + (neighbors.hasSouth ? 1 : 0)
  const countX = (neighbors.hasEast ? 1 : 0) + (neighbors.hasWest ? 1 : 0)

  if (countZ > 0 && countX > 0) {
    return 'junction'
  }
  if (countX > countZ) {
    return 'along-x'
  }
  return 'along-z'
}

/**
 * Analyzes neighbors to classify full 16-state junction topology & rotational symmetry.
 */
export function getRoadTileTopology(neighbors: TileNeighbors): RoadTileTopology {
  const mask =
    (neighbors.hasNorth ? 1 : 0) |
    (neighbors.hasEast ? 2 : 0) |
    (neighbors.hasSouth ? 4 : 0) |
    (neighbors.hasWest ? 8 : 0)

  const count =
    (neighbors.hasNorth ? 1 : 0) +
    (neighbors.hasEast ? 1 : 0) +
    (neighbors.hasSouth ? 1 : 0) +
    (neighbors.hasWest ? 1 : 0)

  if (count === 0) {
    return { junctionType: 'isolated', orientation: 'junction', mask, neighbors, rotation: 0 }
  }

  if (count === 1) {
    // Dead-end
    let rotation = 0
    let orientation: RoadOrientation = 'along-z'
    if (neighbors.hasNorth) { rotation = 0; orientation = 'along-z' }
    else if (neighbors.hasEast) { rotation = 1; orientation = 'along-x' }
    else if (neighbors.hasSouth) { rotation = 2; orientation = 'along-z' }
    else if (neighbors.hasWest) { rotation = 3; orientation = 'along-x' }
    return { junctionType: 'dead_end', orientation, mask, neighbors, rotation }
  }

  if (count === 2) {
    // Straight vs Corner
    if (neighbors.hasNorth && neighbors.hasSouth) {
      return { junctionType: 'straight', orientation: 'along-z', mask, neighbors, rotation: 0 }
    }
    if (neighbors.hasEast && neighbors.hasWest) {
      return { junctionType: 'straight', orientation: 'along-x', mask, neighbors, rotation: 1 }
    }
    // Corner bends
    let rotation = 0
    if (neighbors.hasNorth && neighbors.hasEast) rotation = 0      // NE
    else if (neighbors.hasEast && neighbors.hasSouth) rotation = 1  // ES
    else if (neighbors.hasSouth && neighbors.hasWest) rotation = 2  // SW
    else if (neighbors.hasWest && neighbors.hasNorth) rotation = 3  // WN
    return { junctionType: 'corner', orientation: 'junction', mask, neighbors, rotation }
  }

  if (count === 3) {
    // 3-Way T-Junctions
    let rotation = 0
    if (neighbors.hasNorth && neighbors.hasEast && neighbors.hasSouth) rotation = 0      // branch East
    else if (neighbors.hasEast && neighbors.hasSouth && neighbors.hasWest) rotation = 1  // branch South
    else if (neighbors.hasSouth && neighbors.hasWest && neighbors.hasNorth) rotation = 2 // branch West
    else if (neighbors.hasWest && neighbors.hasNorth && neighbors.hasEast) rotation = 3  // branch North
    return { junctionType: 't_junction', orientation: 'junction', mask, neighbors, rotation }
  }

  // count === 4: Crossroad
  return { junctionType: 'crossroad', orientation: 'junction', mask, neighbors, rotation: 0 }
}

/**
 * Computes organic boundary alpha for seamless junction joining.
 * Open arms receive alpha = 1.0 at tile edges.
 * Perpendicular meeting points receive smooth curved fillets, completely eliminating gaps.
 */
export function calculateVertexAlpha(
  fracX: number, // 0 at West, 1 at East
  fracZ: number, // 0 at North, 1 at South
  neighbors: TileNeighbors,
): number {
  const u = fracX - 0.5 // [-0.5, 0.5]
  const v = fracZ - 0.5 // [-0.5, 0.5]
  const absU = Math.abs(u)
  const absV = Math.abs(v)

  const hasH = u >= 0 ? neighbors.hasEast : neighbors.hasWest
  const hasV = v >= 0 ? neighbors.hasSouth : neighbors.hasNorth

  let alpha = 0

  if (hasH && hasV) {
    // Inner junction fillet: both arms exist!
    // Connect arms seamlessly with a rounded corner fillet
    if (absU < 0.36 || absV < 0.36) {
      alpha = 1.0
    } else {
      const d = Math.hypot(absU - 0.36, absV - 0.36)
      alpha = smoothstep(0.18, 0.0, d)
    }
  } else if (hasH && !hasV) {
    // Horizontal arm active, vertical shoulder fading
    alpha = smoothstep(0.48, 0.22, absV)
  } else if (!hasH && hasV) {
    // Vertical arm active, horizontal shoulder fading
    alpha = smoothstep(0.48, 0.22, absU)
  } else {
    // Neither arm active in this quadrant
    const hasAny = neighbors.hasNorth || neighbors.hasSouth || neighbors.hasEast || neighbors.hasWest
    if (hasAny) {
      // Outer bend / shoulder fading smoothly from center
      const r = Math.hypot(absU, absV)
      alpha = smoothstep(0.35, 0.12, r)
    } else {
      // Isolated turnaround circle
      const r = Math.hypot(u, v)
      alpha = smoothstep(0.44, 0.16, r)
    }
  }

  // Organic wave noise modulation on outer boundaries (preserves 1.0 on interior/connections)
  if (alpha > 0.02 && alpha < 0.98) {
    const wave = (hash2D(Math.round(fracX * 24), Math.round(fracZ * 24), 911) - 0.5) * 0.14
    alpha = clamp(alpha + wave, 0.0, 1.0)
  }

  return alpha
}

/**
 * Evaluates the crowned 3D elevation profile:
 * - Depressed wheel ruts (-0.032m)
 * - Center crown ridge (+0.016m)
 * - Natural banking at corners and junctions
 */
export function getRoadProfileElevation(
  fracX: number,
  fracZ: number,
  topology: RoadTileTopology,
): number {
  const u = fracX - 0.5
  const v = fracZ - 0.5
  const absU = Math.abs(u)
  const absV = Math.abs(v)

  if (topology.junctionType === 'straight' || topology.junctionType === 'dead_end') {
    const t = topology.orientation === 'along-z' ? absU : absV
    // Wheel ruts centered at t = 0.22
    const rutDist = Math.abs(t - 0.22)
    const rutDepth = smoothstep(0.11, 0.0, rutDist) * -0.032
    // Center ridge
    const crownHeight = smoothstep(0.10, 0.0, t) * 0.016
    return rutDepth + crownHeight
  }

  if (topology.junctionType === 'corner') {
    const r = Math.hypot(absU - 0.5, absV - 0.5)
    const rutDist = Math.abs(r - 0.55)
    const rutDepth = smoothstep(0.13, 0.0, rutDist) * -0.028
    const crownHeight = smoothstep(0.10, 0.0, Math.abs(r - 0.38)) * 0.014
    return rutDepth + crownHeight
  }

  if (topology.junctionType === 't_junction' || topology.junctionType === 'crossroad') {
    const distFromCenter = Math.hypot(u, v)
    // Central compacted turn depression
    const centralCompacted = smoothstep(0.35, 0.0, distFromCenter) * -0.018
    return centralCompacted
  }

  // Isolated circle
  const dist = Math.hypot(u, v)
  return smoothstep(0.40, 0.0, dist) * 0.012
}

/**
 * Computes UV coordinates within the 4-quadrant PBR texture atlas:
 * - Top-Left: Straight
 * - Top-Right: Curved Corner
 * - Bottom-Left: T-Junction
 * - Bottom-Right: Crossroad
 */
export function computeRoadVertexUV(
  fracX: number,
  fracZ: number,
  topology: RoadTileTopology,
): [number, number] {
  if (topology.junctionType === 'straight' || topology.junctionType === 'dead_end') {
    const uLoc = topology.orientation === 'along-z' ? fracX : fracZ
    const vLoc = topology.orientation === 'along-z' ? fracZ : fracX
    return [uLoc * 0.5, vLoc * 0.5]
  }

  if (topology.junctionType === 'corner') {
    let uLoc = fracX
    let vLoc = fracZ
    if (topology.rotation === 1) { uLoc = 1.0 - fracZ; vLoc = fracX }
    else if (topology.rotation === 2) { uLoc = 1.0 - fracX; vLoc = 1.0 - fracZ }
    else if (topology.rotation === 3) { uLoc = fracZ; vLoc = 1.0 - fracX }
    return [0.5 + uLoc * 0.5, vLoc * 0.5]
  }

  if (topology.junctionType === 't_junction') {
    let uLoc = fracX
    let vLoc = fracZ
    if (topology.rotation === 1) { uLoc = 1.0 - fracZ; vLoc = fracX }
    else if (topology.rotation === 2) { uLoc = 1.0 - fracX; vLoc = 1.0 - fracZ }
    else if (topology.rotation === 3) { uLoc = fracZ; vLoc = 1.0 - fracX }
    return [uLoc * 0.5, 0.5 + vLoc * 0.5]
  }

  // Crossroad or isolated
  return [0.5 + fracX * 0.5, 0.5 + fracZ * 0.5]
}

/**
 * Builds an organically subdivided, contour-following BufferGeometry for road tiles.
 * Accepts optional reference network tiles so previews seamlessly join with built roads.
 */
export function buildRoadsGeometry(
  terrain: IslandTerrain,
  tiles: readonly RoadTileCoordinate[],
  referenceTiles?: ReadonlyMap<string, RoadTileCoordinate> | readonly RoadTileCoordinate[],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const tileCount = tiles.length

  if (tileCount === 0) {
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3))
    geometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(0), 1))
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(0), 2))
    return geometry
  }

  // Combined lookup map incorporating reference network tiles for seamless neighbor connectivity
  const tilesMap = new Map<string, RoadTileCoordinate>()
  if (referenceTiles) {
    if (Array.isArray(referenceTiles)) {
      for (const t of referenceTiles) {
        tilesMap.set(RoadNetwork.tileKey(t.gridX, t.gridZ), t)
      }
    } else {
      for (const [k, v] of referenceTiles as ReadonlyMap<string, RoadTileCoordinate>) {
        tilesMap.set(k, v)
      }
    }
  }
  for (const t of tiles) {
    tilesMap.set(RoadNetwork.tileKey(t.gridX, t.gridZ), t)
  }

  const verticesPerSide = TILE_SUBDIVISIONS + 1 // 5
  const verticesPerTile = verticesPerSide * verticesPerSide // 25
  const quadsPerTile = TILE_SUBDIVISIONS * TILE_SUBDIVISIONS // 16
  const indicesPerTile = quadsPerTile * 6 // 96

  const positions = new Float32Array(tileCount * verticesPerTile * 3)
  const normals = new Float32Array(tileCount * verticesPerTile * 3)
  const colors = new Float32Array(tileCount * verticesPerTile * 3)
  const alphas = new Float32Array(tileCount * verticesPerTile)
  const uvs = new Float32Array(tileCount * verticesPerTile * 2)
  const indices = new Uint32Array(tileCount * indicesPerTile)

  const halfSize = ROAD_TILE_SIZE * 0.5
  const step = ROAD_TILE_SIZE / TILE_SUBDIVISIONS

  for (let tIdx = 0; tIdx < tileCount; tIdx++) {
    const tile = tiles[tIdx]
    const neighbors = getTileNeighbors(tile, tilesMap)
    const topology = getRoadTileTopology(neighbors)
    const { worldX: centerX, worldZ: centerZ } = RoadNetwork.gridToWorld(tile.gridX, tile.gridZ)

    // Per-tile natural soil tint variation
    const tileSeed = hash2D(tile.gridX * 13, tile.gridZ * 17, 4391)
    const tileR = 1.0 + tileSeed * 0.05
    const tileG = 1.0 + tileSeed * 0.04
    const tileB = 0.98 + tileSeed * 0.03

    const vOffset = tIdx * verticesPerTile
    const iOffset = tIdx * indicesPerTile

    for (let r = 0; r < verticesPerSide; r++) {
      const fracZ = r / TILE_SUBDIVISIONS
      const worldZ = centerZ - halfSize + r * step

      for (let c = 0; c < verticesPerSide; c++) {
        const fracX = c / TILE_SUBDIVISIONS
        const worldX = centerX - halfSize + c * step

        const vertexIdx = vOffset + (r * verticesPerSide + c)
        const pIdx = vertexIdx * 3
        const uIdx = vertexIdx * 2

        const sample = sampleIslandTerrain(terrain, worldX, worldZ)
        const crownedOffset = getRoadProfileElevation(fracX, fracZ, topology)

        positions[pIdx] = worldX
        positions[pIdx + 1] = sample.height + ROAD_SURFACE_OFFSET_Y + crownedOffset
        positions[pIdx + 2] = worldZ

        normals[pIdx] = 0
        normals[pIdx + 1] = 1
        normals[pIdx + 2] = 0

        // Seamless boundary alpha with curved fillets at perpendicular junctions
        const vertexAlpha = calculateVertexAlpha(fracX, fracZ, neighbors)
        alphas[vertexIdx] = vertexAlpha

        colors[pIdx] = tileR
        colors[pIdx + 1] = tileG
        colors[pIdx + 2] = tileB

        // Multi-quadrant UV atlas coordinates
        const [uvU, uvV] = computeRoadVertexUV(fracX, fracZ, topology)
        uvs[uIdx] = uvU
        uvs[uIdx + 1] = uvV
      }
    }

    // Build sub-quad indices
    let quadIdx = 0
    for (let r = 0; r < TILE_SUBDIVISIONS; r++) {
      for (let c = 0; c < TILE_SUBDIVISIONS; c++) {
        const row1 = vOffset + r * verticesPerSide + c
        const row2 = vOffset + (r + 1) * verticesPerSide + c

        const curInd = iOffset + quadIdx * 6
        indices[curInd] = row1
        indices[curInd + 1] = row2
        indices[curInd + 2] = row1 + 1

        indices[curInd + 3] = row1 + 1
        indices[curInd + 4] = row2
        indices[curInd + 5] = row2 + 1

        quadIdx++
      }
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()

  return geometry
}
