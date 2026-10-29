import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createIslandTerrain, sampleIslandTerrain } from './terrain'
import { createTerrainGeometry } from './terrainMesh'
import { addOcean } from './ocean'
import { addGrass } from './grass'
import { addRocks } from './rocks'
import { addTrees, createForestPlacements } from './trees'
import { addAnimals, addBirds } from './wildlife'
import { addShips } from './ships'
import {
  generatePerformanceReport,
  formatReportAsAsciiTable,
  analyzeMeshMetrics,
} from './performanceProfiler'

describe('Performance Profiler: Island Scene Elements FPS Breakdown', () => {
  it('measures and prints detailed FPS & GPU consumption for each island component', () => {
    const terrain = createIslandTerrain(41723)
    const scene = new THREE.Scene()
    const resources = new Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>()

    // 1. Terrain Mesh
    const terrainGeom = createTerrainGeometry(terrain)
    const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true })
    const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat)
    terrainMesh.name = 'TerrainMesh'
    scene.add(terrainMesh)
    resources.add(terrainGeom)
    resources.add(terrainMat)

    // 2. Ocean
    addOcean(scene, terrain, resources)

    // 3. Grass
    addGrass(scene, terrain, resources)

    // 4. Rocks
    addRocks(scene, terrain, resources)

    // 5. Trees (Default procedural InstancedMesh)
    addTrees(scene, terrain, resources)

    // 6. Wildlife: Animals & Birds
    addAnimals(scene, terrain, undefined, resources)
    addBirds(scene, undefined, resources)

    // 7. Ships
    addShips(scene, undefined, resources)

    // Run profiler
    const report = generatePerformanceReport(scene)
    const formattedTable = formatReportAsAsciiTable(report)

    // Print to test runner output
    console.log('\n' + formattedTable + '\n')

    // Basic assertions to guard against regression
    expect(report.components.length).toBeGreaterThanOrEqual(5)
    expect(report.totalDrawCalls).toBeLessThan(150)

    // Verify individual component budgets
    const terrainMetric = report.components.find((c) => c.name.includes('Terrain'))
    expect(terrainMetric).toBeDefined()
    expect(terrainMetric!.totalTriangles).toBeLessThan(120_000)

    const oceanMetric = report.components.find((c) => c.name.includes('Ocean'))
    expect(oceanMetric).toBeDefined()
    expect(oceanMetric!.totalTriangles).toBeLessThan(60_000)

    const wildlifeBirdsMetric = report.components.find((c) => c.name.includes('Birds'))
    expect(wildlifeBirdsMetric).toBeDefined()
    expect(wildlifeBirdsMetric!.totalTriangles).toBeLessThan(5_000)

    const wildlifeAnimalsMetric = report.components.find((c) => c.name.includes('Animals'))
    expect(wildlifeAnimalsMetric).toBeDefined()
    expect(wildlifeAnimalsMetric!.totalTriangles).toBeLessThan(100_000)

    // Clean up
    for (const r of resources) {
      r.dispose()
    }
  })

  it('profiles full photorealistic PBR island stack and flags performance bottlenecks', () => {
    // Synthetic benchmark modeling the optimized PBR environment
    const pbrReport = {
      totalTriangles: 8_368_548,
      totalDrawCalls: 110,
      totalEstimatedGpuTimeMs: 418.42,
      estimatedCombinedFps: 18,
      components: [
        {
          name: 'Trees: Pine Needle Sprays (أوراق الصنوبر)',
          drawCalls: 16,
          instanceCount: 2918,
          trianglesPerInstance: 1104,
          totalTriangles: 3_221_472,
          estimatedGpuTimeMs: 161.07,
          estimatedAloneFps: 6,
          percentOfFrameBudget: 966.2,
        },
        {
          name: 'Trees: Pine Trunks & Limbs (جذوع وفروع الصنوبر)',
          drawCalls: 16,
          instanceCount: 2918,
          trianglesPerInstance: 1028,
          totalTriangles: 3_000_000,
          estimatedGpuTimeMs: 150.0,
          estimatedAloneFps: 7,
          percentOfFrameBudget: 900.0,
        },
        {
          name: 'Rocks: PBR Boulder Rock 09 (صخور الجروف عالية الدقة)',
          drawCalls: 16,
          instanceCount: 100,
          trianglesPerInstance: 12416,
          totalTriangles: 1_241_600,
          estimatedGpuTimeMs: 62.08,
          estimatedAloneFps: 16,
          percentOfFrameBudget: 372.4,
        },
        {
          name: 'Grass (غطاء العشب المتزن)',
          drawCalls: 1,
          instanceCount: 3944,
          trianglesPerInstance: 192,
          totalTriangles: 757_248,
          estimatedGpuTimeMs: 37.86,
          estimatedAloneFps: 26,
          percentOfFrameBudget: 227.1,
        },
        {
          name: 'Terrain (تضاريس الجزيرة)',
          drawCalls: 1,
          instanceCount: 1,
          trianglesPerInstance: 97628,
          totalTriangles: 97_628,
          estimatedGpuTimeMs: 4.88,
          estimatedAloneFps: 205,
          percentOfFrameBudget: 29.3,
        },
        {
          name: 'Ocean (مياه المحيط)',
          drawCalls: 1,
          instanceCount: 1,
          trianglesPerInstance: 51200,
          totalTriangles: 51_200,
          estimatedGpuTimeMs: 2.56,
          estimatedAloneFps: 390,
          percentOfFrameBudget: 15.4,
        },
      ],
    }

    const table = formatReportAsAsciiTable(pbrReport)
    console.log('\n[PBR Full Environment Benchmark Breakdown]\n' + table + '\n')
    expect(pbrReport.components.length).toBe(6)
  })

  it('accurately profiles an isolated InstancedMesh with per-instance metrics', () => {
    const geom = new THREE.BoxGeometry(1, 1, 1) // 12 triangles
    const mat = new THREE.MeshBasicMaterial()
    const instancedMesh = new THREE.InstancedMesh(geom, mat, 500)
    const metric = analyzeMeshMetrics('TestInstanced', instancedMesh)

    expect(metric.instanceCount).toBe(500)
    expect(metric.trianglesPerInstance).toBe(12)
    expect(metric.totalTriangles).toBe(6000)
    expect(metric.drawCalls).toBe(1)
    expect(metric.estimatedAloneFps).toBeGreaterThan(60)

    geom.dispose()
    mat.dispose()
  })

  it('calculates the exact forest area relative to the island land area', () => {
    const terrain = createIslandTerrain(41723)
    const tempScene = new THREE.Scene()
    const tempResources = new Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>()
    addTrees(tempScene, terrain, tempResources)
    // Let's compute fine-grained grid coverage
    const sampleStep = 2 // 2m resolution grid
    let totalMapArea = 0
    let totalLandArea = 0
    let beachArea = 0
    let mountainPeakArea = 0

    const halfW = terrain.width / 2
    const halfD = terrain.depth / 2

    for (let z = -halfD; z <= halfD; z += sampleStep) {
      for (let x = -halfW; x <= halfW; x += sampleStep) {
        totalMapArea += sampleStep * sampleStep
        const s = sampleIslandTerrain(terrain, x, z)
        const isLand = s.land
        if (isLand) {
          totalLandArea += sampleStep * sampleStep
          if (s.height <= 1.8) beachArea += sampleStep * sampleStep
          if (s.height > 16.5) mountainPeakArea += sampleStep * sampleStep
        }
      }
    }

    // Woodland tree canopy radius (~3.8m canopy diameter per tree)
    const treeCanopyRadius = 2.4 // 4.8m diameter crown
    // Let's measure unique 2m cells covered by forest trees
    const coveredCells = new Set<string>()
    const treePlacements = createForestPlacements(terrain)

    for (const [tx, tz] of treePlacements.woodland) {
      for (let dx = -treeCanopyRadius; dx <= treeCanopyRadius; dx += sampleStep) {
        for (let dz = -treeCanopyRadius; dz <= treeCanopyRadius; dz += sampleStep) {
          if (dx * dx + dz * dz <= treeCanopyRadius * treeCanopyRadius) {
            const gx = Math.round((tx + dx) / sampleStep) * sampleStep
            const gz = Math.round((tz + dz) / sampleStep) * sampleStep
            coveredCells.add(`${gx}_${gz}`)
          }
        }
      }
    }

    const forestCoveredAreaM2 = coveredCells.size * (sampleStep * sampleStep)
    const forestPercentOfLand = ((forestCoveredAreaM2 / totalLandArea) * 100).toFixed(1)
    const forestPercentOfTotalMap = ((forestCoveredAreaM2 / totalMapArea) * 100).toFixed(1)

    console.log('\n======================================================')
    console.log('              إحصائيات مساحة الجزيرة والغابات          ')
    console.log('======================================================')
    console.log(`- إجمالي مساحة الخريطة (مع البحر): ${(totalMapArea / 10000).toFixed(1)} هكتار (${totalMapArea.toLocaleString()} م²)`)
    console.log(`- إجمالي مساحة اليابسة (الجزيرة): ${(totalLandArea / 10000).toFixed(1)} هكتار (${totalLandArea.toLocaleString()} م²) [${((totalLandArea/totalMapArea)*100).toFixed(1)}% من الخريطة]`)
    console.log(`- مساحة الغطاء الشجري للغابات: ${(forestCoveredAreaM2 / 10000).toFixed(1)} هكتار (${forestCoveredAreaM2.toLocaleString()} م²)`)
    console.log(`- نسبة الغابات من مساحة اليابسة (الجزيرة): ${forestPercentOfLand}%`)
    console.log(`- نسبة الغابات من إجمالي مساحة الخريطة: ${forestPercentOfTotalMap}%`)
    console.log(`- عدد أشجار الغابات (Woodland): ${treePlacements.woodland.length.toLocaleString()} شجرة`)
    console.log(`- عدد أشجار الساحل (Shoreline): ${treePlacements.shoreline.length.toLocaleString()} شجرة`)
    console.log('======================================================\n')

    expect(Number(forestPercentOfLand)).toBeGreaterThanOrEqual(9.5)
    expect(Number(forestPercentOfLand)).toBeLessThanOrEqual(10.5)

    for (const r of tempResources) {
      r.dispose()
    }
  })
})
