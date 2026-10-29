import * as THREE from 'three'

/**
 * Metric profile representing the computational load of a single scene layer or component.
 */
export type ComponentPerformanceMetric = {
  name: string
  drawCalls: number
  instanceCount: number
  trianglesPerInstance: number
  totalTriangles: number
  estimatedGpuTimeMs: number
  estimatedAloneFps: number
  percentOfFrameBudget: number
}

/**
 * Full scene performance profile breakdown.
 */
export type ScenePerformanceReport = {
  totalTriangles: number
  totalDrawCalls: number
  totalEstimatedGpuTimeMs: number
  estimatedCombinedFps: number
  components: ComponentPerformanceMetric[]
}

/**
 * Assumed baseline throughput for entry-level desktop GPU (e.g., GT 730 on D3D11/WebGL):
 * Approximately 20 million triangles/sec throughput under real-world shader and state workloads.
 */
const BASELINE_TRIANGLE_THROUGHPUT_PER_SEC = 20_000_000
const DRAW_CALL_OVERHEAD_MS = 0.015
const TARGET_FRAME_BUDGET_MS = 16.67 // 60 FPS target budget

/**
 * Counts geometry triangles accurately for indexed and non-indexed geometries.
 */
export function countGeometryTriangles(geometry: THREE.BufferGeometry): number {
  if (geometry.index) {
    return Math.floor(geometry.index.count / 3)
  }
  const pos = geometry.attributes.position
  return pos ? Math.floor(pos.count / 3) : 0
}

/**
 * Inspects a Three.js Object3D hierarchy and summarizes triangle counts, instance counts, and draw calls.
 */
export function analyzeMeshMetrics(name: string, root: THREE.Object3D): ComponentPerformanceMetric {
  let drawCalls = 0
  let totalInstances = 0
  let totalTriangles = 0
  let baseTriangles = 0

  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) {
      drawCalls += 1
      const count = object.count
      totalInstances += count
      const geomTris = countGeometryTriangles(object.geometry)
      baseTriangles = Math.max(baseTriangles, geomTris)
      totalTriangles += geomTris * count
    } else if (object instanceof THREE.Mesh) {
      drawCalls += 1
      totalInstances += 1
      const geomTris = countGeometryTriangles(object.geometry)
      baseTriangles = Math.max(baseTriangles, geomTris)
      totalTriangles += geomTris
    }
  })

  const trianglesPerInstance = totalInstances > 0 ? Math.round(totalTriangles / totalInstances) : baseTriangles
  const renderTimeMs = (totalTriangles / BASELINE_TRIANGLE_THROUGHPUT_PER_SEC) * 1000 + drawCalls * DRAW_CALL_OVERHEAD_MS
  const estimatedGpuTimeMs = Number(renderTimeMs.toFixed(2))
  const estimatedAloneFps = renderTimeMs > 0 ? Math.min(1000, Math.round(1000 / Math.max(1, renderTimeMs))) : 1000
  const percentOfFrameBudget = Number(((renderTimeMs / TARGET_FRAME_BUDGET_MS) * 100).toFixed(1))

  return {
    name,
    drawCalls,
    instanceCount: totalInstances,
    trianglesPerInstance,
    totalTriangles,
    estimatedGpuTimeMs,
    estimatedAloneFps,
    percentOfFrameBudget,
  }
}

/**
 * Classifies all meshes in an island scene into their respective functional layers.
 */
export function categorizeSceneMeshes(scene: THREE.Scene): Map<string, THREE.Object3D[]> {
  const groups = new Map<string, THREE.Object3D[]>()

  const add = (category: string, obj: THREE.Object3D) => {
    let list = groups.get(category)
    if (!list) {
      list = []
      groups.set(category, list)
    }
    list.push(obj)
  }

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh)) return

    const mat = child.material
    const matName = (Array.isArray(mat) ? mat[0]?.name : mat?.name) || ''
    const geom = child.geometry
    const vertexCount = geom.attributes.position ? geom.attributes.position.count : 0
    const parentName = child.parent?.name || ''
    const objName = child.name || ''

    // 1. Grass
    if (objName === 'Grass_Far' || (child.material as any)?.userData?.grassFar) {
      add('Grass: Simple Line LOD (خطوط العشب البسيطة)', child)
      return
    }
    if ((child.material as any)?.userData?.grassTime) {
      add('Grass (غطاء العشب)', child)
      return
    }

    // 2. Ocean
    if ((child.material as any)?.userData?.oceanUniforms || (child.material as any)?.userData?.oceanTime || matName.includes('ocean')) {
      add('Ocean (مياه المحيط)', child)
      return
    }

    // 3. Terrain Mesh
    if (child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh) && geom.attributes.color && (objName === 'TerrainMesh' || vertexCount > 10000)) {
      add('Terrain (تضاريس الجزيرة)', child)
      return
    }

    // 4. Trees (Procedural fallback or Scots pine models)
    if (
      objName.toLowerCase().includes('tree') ||
      matName.toLowerCase().includes('foliage') ||
      matName.toLowerCase().includes('bark') ||
      objName.toLowerCase().includes('pine') ||
      objName.toLowerCase().includes('limb') ||
      objName.toLowerCase().includes('needle') ||
      (child instanceof THREE.InstancedMesh && vertexCount === 524)
    ) {
      add('Trees (الغابات والأشجار)', child)
      return
    }

    // 5. Rocks (Procedural variants or PBR rock scans)
    if (
      objName.toLowerCase().includes('rock') ||
      matName.toLowerCase().includes('rock') ||
      matName.toLowerCase().includes('slate') ||
      (child instanceof THREE.InstancedMesh && [70, 72, 80, 128, 408, 6208].includes(vertexCount))
    ) {
      add('Rocks (الصخور والجروف)', child)
      return
    }

    // 6. Wildlife: Birds
    if (
      objName.toLowerCase().includes('bird') ||
      parentName.toLowerCase().includes('bird') ||
      vertexCount <= 16
    ) {
      add('Wildlife: Birds (الطيور المحلقة)', child)
      return
    }

    // 7. Wildlife: Animals
    if (
      objName.toLowerCase().includes('animal') ||
      parentName.toLowerCase().includes('animal') ||
      (vertexCount > 16 && vertexCount <= 72)
    ) {
      add('Wildlife: Animals (حيوانات الرعي)', child)
      return
    }

    // 8. Ships
    if (
      objName.toLowerCase().includes('ship') ||
      parentName.toLowerCase().includes('ship') ||
      (vertexCount > 72 && vertexCount <= 150)
    ) {
      add('Ships (سفن الإبحار الساحلية)', child)
      return
    }

    // Fallback / other
    add('Other Scene Elements', child)
  })

  return groups
}

/**
 * Generates a full scene performance breakdown report.
 */
export function generatePerformanceReport(scene: THREE.Scene): ScenePerformanceReport {
  const groups = categorizeSceneMeshes(scene)
  const components: ComponentPerformanceMetric[] = []

  let totalTriangles = 0
  let totalDrawCalls = 0
  let totalGpuTimeMs = 0

  for (const [name, objects] of groups) {
    const container = new THREE.Group()
    objects.forEach((obj) => container.add(obj.clone()))
    const metric = analyzeMeshMetrics(name, container)
    components.push(metric)
    totalTriangles += metric.totalTriangles
    totalDrawCalls += metric.drawCalls
    totalGpuTimeMs += metric.estimatedGpuTimeMs
  }

  // Sort components by GPU time / triangle cost descending
  components.sort((a, b) => b.totalTriangles - a.totalTriangles)

  const estimatedCombinedFps = totalGpuTimeMs > 0 ? Math.round(1000 / totalGpuTimeMs) : 60

  return {
    totalTriangles,
    totalDrawCalls,
    totalEstimatedGpuTimeMs: Number(totalGpuTimeMs.toFixed(2)),
    estimatedCombinedFps,
    components,
  }
}

/**
 * Formats the performance report into an easy-to-read ASCII table for test logs and reports.
 */
export function formatReportAsAsciiTable(report: ScenePerformanceReport): string {
  const lines: string[] = []
  lines.push('========================================================================================================')
  lines.push('                              تقرير استهلاك العناصر لمعدل الإطارات (FPS Profiler)                       ')
  lines.push('========================================================================================================')
  lines.push(
    [
      'العنصر (Component)'.padEnd(30),
      'النسخ (Inst)'.padStart(12),
      'مثلثات/نسخة'.padStart(14),
      'إجمالي المثلثات'.padStart(16),
      'زمن GPU (ms)'.padStart(14),
      'استهلاك الميزانية'.padStart(16),
    ].join(' | '),
  )
  lines.push('--------------------------------------------------------------------------------------------------------')

  for (const c of report.components) {
    lines.push(
      [
        c.name.padEnd(30),
        c.instanceCount.toLocaleString().padStart(12),
        c.trianglesPerInstance.toLocaleString().padStart(14),
        c.totalTriangles.toLocaleString().padStart(16),
        `${c.estimatedGpuTimeMs} ms`.padStart(14),
        `${c.percentOfFrameBudget}%`.padStart(16),
      ].join(' | '),
    )
  }

  lines.push('========================================================================================================')
  lines.push(`إجمالي المثلثات بالمشهد: ${report.totalTriangles.toLocaleString()} مثلث`)
  lines.push(`إجمالي استدعاءات الرسم (Draw Calls): ${report.totalDrawCalls}`)
  lines.push(`الوقت التقديري لمعالجة الإطار: ${report.totalEstimatedGpuTimeMs} مللي ثانية`)
  lines.push(`معدل الإطارات التقديري الناتج: ~${report.estimatedCombinedFps} FPS`)
  lines.push('========================================================================================================')

  return lines.join('\n')
}
