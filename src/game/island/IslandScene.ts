import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import pineUrl from '../../assets/environment/mature-scots-pine.glb?url'
import rockDocument from '../../assets/environment/rock-09/rock-09.gltf?raw'
import rockBufferUrl from '../../assets/environment/rock-09/rock_09.bin?url'
import rockNormalUrl from '../../assets/environment/rock-09/textures/rock_09_nor_gl_1k.jpg?url'
import rockDiffuseUrl from '../../assets/environment/rock-09/textures/rock_09_diff_1k.jpg?url'
import rockArmUrl from '../../assets/environment/rock-09/textures/rock_09_arm_1k.jpg?url'
import { createIslandTerrain, sampleIslandTerrain, type IslandTerrain } from './terrain'
import { createCameraController } from './CameraController'
import { createFrameRateMonitor, type FrameRateReading } from './FrameRateMonitor'

export type IslandSceneHandle = {
  resize(): void
  dispose(): void
}

export type IslandSceneOptions = {
  onFrameRateUpdate?: (reading: FrameRateReading) => void
}

const terrainSeed = 41723
const oceanColor = 0x397c91
function terrainAt(terrain: IslandTerrain, x: number, z: number) {
  return sampleIslandTerrain(terrain, x, z)
}

export function createTreePlacements(terrain: IslandTerrain): Array<[number, number]> {
  const centers: Array<[number, number]> = [
    [-0.34, -0.18], [0.34, -0.18], [-0.38, 0.08], [0.38, 0.08],
    [-0.28, 0.14], [0.28, 0.14], [-0.1, 0.17], [0.1, 0.17],
  ]
  const placements: Array<[number, number]> = []
  centers.forEach(([centerX, centerZ], clusterIndex) => {
    for (let index = 0; index < 18; index += 1) {
      const angle = index * 2.399963229728653 + clusterIndex * 0.71
      const radius = 0.025 + (index % 6) * 0.017
      const x = (centerX + Math.cos(angle) * radius) * terrain.width / 2
      const z = (centerZ + Math.sin(angle) * radius) * terrain.depth / 2
      const sample = terrainAt(terrain, x, z)
      if (sample.land && sample.height <= 1.65 && z < terrain.depth * 0.25 && !(Math.abs(x) < 13 && z < 22)) placements.push([x, z])
    }
  })
  return placements
}

export function createRockPlacements(terrain: IslandTerrain): Array<[number, number]> {
  const placements: Array<[number, number]> = []
  for (let row = 8; row < terrain.segments - 8; row += 6) {
    for (let column = 8; column < terrain.segments - 8; column += 6) {
      const x = (column / terrain.segments - 0.5) * terrain.width
      const z = (row / terrain.segments - 0.5) * terrain.depth
      const sample = terrainAt(terrain, x, z)
      const hash = Math.sin(column * 12.9898 + row * 78.233) * 43758.5453
      if (sample.land && sample.height > 0.9 && sample.height < 3.2 && hash - Math.floor(hash) > 0.52) placements.push([x, z])
    }
  }
  return placements
}

export function createTerrainGeometry(terrain: IslandTerrain): THREE.BufferGeometry {
  type TerrainVertex = { x: number; y: number; z: number; color: THREE.Color }
  const side = terrain.segments + 1
  const seabedLimit = -1.05
  const lowland = new THREE.Color(0x59734c)
  const meadow = new THREE.Color(0x71805a)
  const highland = new THREE.Color(0x777461)
  const rock = new THREE.Color(0xaaa398)
  const beach = new THREE.Color(0x9d9b79)
  const vertices: TerrainVertex[] = []
  const indices: number[] = []
  const vertexIds = new Map<string, number>()
  const getTerrainVertex = (index: number): TerrainVertex => {
    const height = terrain.heights[index]
    const column = index % side
    const row = Math.floor(index / side)
    const left = terrain.heights[row * side + Math.max(0, column - 1)]
    const right = terrain.heights[row * side + Math.min(terrain.segments, column + 1)]
    const back = terrain.heights[Math.max(0, row - 1) * side + column]
    const front = terrain.heights[Math.min(terrain.segments, row + 1) * side + column]
    const slope = Math.hypot(right - left, front - back)
    const color = height < 0.08 ? beach.clone()
      : height < 0.28 ? lowland.clone().lerp(meadow, (height - 0.08) / 0.2)
        : height < 0.85 ? meadow.clone().lerp(highland, (height - 0.28) / 0.57)
          : highland.clone().lerp(rock, Math.min(1, (height - 0.85) / 2.1))
    if (slope > 0.16) color.lerp(rock, Math.min(0.75, (slope - 0.16) * 1.8))
    return {
      x: ((index % side) / terrain.segments - 0.5) * terrain.width,
      y: height,
      z: (Math.floor(index / side) / terrain.segments - 0.5) * terrain.depth,
      color,
    }
  }
  const addVertex = (key: string, vertex: TerrainVertex) => {
    const existing = vertexIds.get(key)
    if (existing !== undefined) return existing
    const index = vertices.push(vertex) - 1
    vertexIds.set(key, index)
    return index
  }
  const intersection = (from: TerrainVertex, to: TerrainVertex, height: number): TerrainVertex => {
    const amount = (from.y - height) / (from.y - to.y)
    return {
      x: THREE.MathUtils.lerp(from.x, to.x, amount),
      y: height,
      z: THREE.MathUtils.lerp(from.z, to.z, amount),
      color: beach,
    }
  }
  const addClippedTriangle = (sourceIndices: number[]) => {
    const polygon: Array<{ vertex: TerrainVertex; key: string }> = []
    let previousIndex = sourceIndices[sourceIndices.length - 1]
    let previous = getTerrainVertex(previousIndex)
    let previousInside = previous.y >= seabedLimit
    for (const currentIndex of sourceIndices) {
      const current = getTerrainVertex(currentIndex)
      const currentInside = current.y >= seabedLimit
      if (currentInside !== previousInside) {
        const first = Math.min(previousIndex, currentIndex)
        const second = Math.max(previousIndex, currentIndex)
        const key = `edge:${first}:${second}`
        const point = intersection(previous, current, seabedLimit)
        polygon.push({ vertex: point, key })
      }
      if (currentInside) polygon.push({ vertex: current, key: `vertex:${currentIndex}` })
      previousIndex = currentIndex
      previous = current
      previousInside = currentInside
    }
    if (polygon.length < 3) return
    const first = addVertex(polygon[0].key, polygon[0].vertex)
    for (let index = 1; index < polygon.length - 1; index += 1) {
      indices.push(first, addVertex(polygon[index].key, polygon[index].vertex), addVertex(polygon[index + 1].key, polygon[index + 1].vertex))
    }
  }

  for (let row = 0; row < terrain.segments; row += 1) {
    for (let column = 0; column < terrain.segments; column += 1) {
      const a = row * side + column
      const b = a + 1
      const c = a + side
      const d = c + 1
      addClippedTriangle([a, c, b])
      addClippedTriangle([b, c, d])
    }
  }

  const positions = new Float32Array(vertices.length * 3)
  const colors = new Float32Array(vertices.length * 3)
  vertices.forEach((vertex, index) => {
    positions.set([vertex.x, vertex.y, vertex.z], index * 3)
    colors.set([vertex.color.r, vertex.color.g, vertex.color.b], index * 3)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addOcean(
  scene: THREE.Scene,
  resources: Set<THREE.Material | THREE.BufferGeometry>,
): (time: number) => void {
  const geometry = new THREE.PlaneGeometry(800, 800, 96, 96)
  const material = new THREE.MeshStandardMaterial({ color: oceanColor, roughness: 0.32, metalness: 0.04 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOceanTime = { value: 0 }
    shader.fragmentShader = `uniform float uOceanTime;\nvarying vec3 vOceanWorldPosition;\n${shader.fragmentShader}`
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float shore = 1.0 - smoothstep(105.0, 205.0, length(vOceanWorldPosition.xz));
      float distanceFromIsland = length(vOceanWorldPosition.xz);
      float horizonFog = smoothstep(245.0, 385.0, distanceFromIsland);
      float glint = pow(max(0.0, sin(vOceanWorldPosition.x * 0.11 + uOceanTime * 0.35) * sin(vOceanWorldPosition.z * 0.08 - uOceanTime * 0.22)), 18.0) * 0.035;
      vec3 waterColor = mix(vec3(0.025, 0.22, 0.30), vec3(0.12, 0.43, 0.48), shore);
      diffuseColor.rgb = mix(waterColor, vec3(0.72, 0.816, 0.824), horizonFog) + glint;`,
    )
    shader.vertexShader = `uniform float uOceanTime;\nvarying vec3 vOceanWorldPosition;\n${shader.vertexShader}`
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvOceanWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\ntransformed.z += sin(position.x * 0.045 + uOceanTime * 0.35) * 0.012 + sin(position.y * 0.06 - uOceanTime * 0.22) * 0.008 + sin(position.x * 0.12 + position.y * 0.09 + uOceanTime * 0.18) * 0.004;`,
    )
    material.userData.oceanTime = shader.uniforms.uOceanTime
  }
  material.customProgramCacheKey = () => 'island-ocean-waves-v1'
  resources.add(geometry)
  resources.add(material)
  const ocean = new THREE.Mesh(geometry, material)
  ocean.rotation.x = -Math.PI / 2
  ocean.position.y = -0.025
  ocean.receiveShadow = true
  scene.add(ocean)
  return (time) => {
    const uniform = material.userData.oceanTime as { value: number } | undefined
    if (uniform) uniform.value = time
  }
}

export function rewriteRockDocument(jsonDocument: string): string {
  const absoluteUrl = (url: string) => new URL(url, window.document.baseURI).href
  return jsonDocument
    .replace(/("uri"\s*:\s*)"textures\/rock_09_nor_gl_1k\.jpg"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockNormalUrl)}"`)
    .replace(/("uri"\s*:\s*)"textures\/rock_09_diff_1k\.jpg"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockDiffuseUrl)}"`)
    .replace(/("uri"\s*:\s*)"textures\/rock_09_arm_1k\.jpg"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockArmUrl)}"`)
    .replace(/("uri"\s*:\s*)"rock_09\.bin"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockBufferUrl)}"`)
}

function localRockDocumentUrl(): string {
  const document = rewriteRockDocument(rockDocument)
  return URL.createObjectURL(new Blob([document], { type: 'model/gltf+json' }))
}

function addInstances(
  scene: THREE.Scene,
  root: THREE.Object3D,
  terrain: IslandTerrain,
  resources: Set<THREE.Material | THREE.BufferGeometry>,
  kind: 'tree' | 'rock',
) {
  root.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })
  for (const mesh of meshes) {
    const material = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const item of material) resources.add(item)
    resources.add(mesh.geometry)
    const matrices: THREE.Matrix4[] = []
    const placements = kind === 'tree' ? createTreePlacements(terrain) : createRockPlacements(terrain)
    for (const [x, z] of placements) {
      const sample = terrainAt(terrain, x, z)
      if (!sample.land || (kind === 'tree' && sample.height > 1.65) || (kind === 'tree' && Math.abs(x) < 13 && z < 22)) continue
      const matrix = new THREE.Matrix4()
      const scale = 0.65 + ((Math.abs(x * 13 + z * 7) % 21) / 100)
      matrix.compose(
        new THREE.Vector3(x, sample.height, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (x - z) * 0.07),
        new THREE.Vector3(kind === 'rock' ? scale * 15 : scale, kind === 'rock' ? scale * 15 : scale, kind === 'rock' ? scale * 15 : scale),
      )
      matrix.multiply(mesh.matrixWorld)
      matrices.push(matrix)
    }
    if (!matrices.length) continue
    const instances = new THREE.InstancedMesh(mesh.geometry, mesh.material, matrices.length)
    matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix))
    instances.instanceMatrix.needsUpdate = true
    instances.castShadow = true
    instances.receiveShadow = true
    scene.add(instances)
  }
}

export async function createIslandScene(
  container: HTMLElement,
  onFatalError: (message: string) => void,
  options: IslandSceneOptions = {},
): Promise<IslandSceneHandle> {
  const resources = new Set<THREE.Material | THREE.BufferGeometry>()
  let renderer: THREE.WebGLRenderer | undefined
  let animationFrame = 0
  let startTime = 0
  let animateOcean: (time: number) => void = () => {}
  let disposed = false
  let cameraController: ReturnType<typeof createCameraController> | undefined
  let previousFrameTime = 0
  let lastFrameRateNotification = 0
  let lastFrameRateState: FrameRateReading['state'] = 'measuring'
  const frameRateMonitor = createFrameRateMonitor()
  const noop: IslandSceneHandle = { resize() {}, dispose() {} }
  try {
    const terrain = createIslandTerrain(terrainSeed)
    if (terrain.heights.length !== (terrain.segments + 1) ** 2 || terrain.landMask.length !== terrain.heights.length) {
      throw new Error('بيانات التضاريس غير مكتملة')
    }
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xb8d0d2)
    scene.fog = new THREE.Fog(0xb8d0d2, 400, 1400)
    const camera = new THREE.PerspectiveCamera(42, Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight), 0.1, 2400)
    const islandCenter = new THREE.Vector3(0, 0.35, 0)
    const initialTilt = 1.2
    const initialAzimuth = Math.atan2(112, -135)
    const maximumHeight = terrain.heights.reduce((maximum, height) => Math.max(maximum, height), 0)
    const terrainHalfWidth = terrain.width / 2
    const terrainHalfDepth = terrain.depth / 2
    const viewRadius = Math.hypot(terrainHalfWidth, maximumHeight - islandCenter.y, terrainHalfDepth)
    const getFitDistance = (aspect: number) => {
      const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2)
      const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect)
      return viewRadius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov))
    }
    const fitDistance = getFitDistance(camera.aspect)
    const fog = scene.fog as THREE.Fog
    const updateFogForFitDistance = (distance: number) => {
      fog.near = Math.max(360, distance * 1.12)
      fog.far = Math.max(1500, distance * 3.2)
    }
    updateFogForFitDistance(fitDistance)
    camera.userData.islandFitDistance = fitDistance
    camera.userData.islandCameraTarget = islandCenter.clone()
    const initialDistance = fitDistance
    camera.position.set(
      islandCenter.x + Math.sin(initialAzimuth) * Math.sin(initialTilt) * initialDistance,
      islandCenter.y + Math.cos(initialTilt) * initialDistance,
      islandCenter.z + Math.cos(initialAzimuth) * Math.sin(initialTilt) * initialDistance,
    )
    camera.lookAt(islandCenter)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.96
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = true
    container.appendChild(renderer.domElement)

    const hemisphere = new THREE.HemisphereLight(0xdbe9e5, 0x665b45, 1.25)
    scene.add(hemisphere)
    const sunlight = new THREE.DirectionalLight(0xffe0b2, 2.15)
    sunlight.position.set(-55, 85, -35)
    sunlight.castShadow = true
    sunlight.shadow.mapSize.set(2048, 2048)
    sunlight.shadow.camera.left = -75
    sunlight.shadow.camera.right = 75
    sunlight.shadow.camera.top = 75
    sunlight.shadow.camera.bottom = -75
    sunlight.shadow.bias = -0.0002
    scene.add(sunlight)
    const fill = new THREE.AmbientLight(0xc1d8d9, 0.22)
    scene.add(fill)

    const terrainGeometry = createTerrainGeometry(terrain)
    const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
    resources.add(terrainGeometry)
    resources.add(terrainMaterial)
    const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial)
    terrainMesh.receiveShadow = true
    terrainMesh.castShadow = true
    scene.add(terrainMesh)
    animateOcean = addOcean(scene, resources)

    const loader = new GLTFLoader()
    const rockUrl = localRockDocumentUrl()
    const models = [
      { url: pineUrl, label: 'Scots pine', kind: 'tree' as const },
      { url: rockUrl, label: 'rock', kind: 'rock' as const },
    ]
    let rockUrlRevoked = false
    const revokeRockUrl = () => {
      if (rockUrlRevoked) return
      rockUrlRevoked = true
      URL.revokeObjectURL(rockUrl)
    }
    void Promise.all(models.map(async ({ url, label, kind }) => {
      try {
        const { scene: model } = await loader.loadAsync(url)
        if (disposed) {
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose()
              const materials = Array.isArray(child.material) ? child.material : [child.material]
              materials.forEach((material) => {
                material.dispose()
                for (const value of Object.values(material)) {
                  if (value instanceof THREE.Texture) value.dispose()
                }
              })
            }
          })
          return
        }
        addInstances(scene, model, terrain, resources, kind)
        if (renderer) renderer.shadowMap.needsUpdate = true
      } catch (error) {
        console.warn(`Optional environment ${label} model failed to load; terrain will remain available.`, error)
      } finally {
        if (url === rockUrl) revokeRockUrl()
      }
    }))

    const resize = () => {
      if (!renderer || disposed) return
      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      const requiredFitDistance = getFitDistance(camera.aspect)
      updateFogForFitDistance(requiredFitDistance)
      camera.userData.islandFitDistance = requiredFitDistance
      const currentTarget = camera.userData.islandCameraTarget as THREE.Vector3
      const currentDistance = camera.position.distanceTo(currentTarget)
      if (currentDistance < requiredFitDistance) {
        const viewDirection = camera.position.clone().sub(currentTarget).normalize()
        camera.position.copy(currentTarget).addScaledVector(viewDirection, requiredFitDistance)
        camera.lookAt(currentTarget)
        cameraController?.setDistance(requiredFitDistance)
      }
      renderer.setSize(width, height, false)
    }
    const publishFrameRate = (reading: FrameRateReading, time: number) => {
      if (!options.onFrameRateUpdate) return
      if (reading.state === lastFrameRateState && reading.state !== 'active') return
      if (reading.state === 'active' && time - lastFrameRateNotification < 500) return
      lastFrameRateState = reading.state
      lastFrameRateNotification = time
      options.onFrameRateUpdate(reading)
    }
    const onVisibilityChange = () => {
      frameRateMonitor.reset()
      const reading = frameRateMonitor.record(performance.now(), !document.hidden)
      publishFrameRate(reading, performance.now())
    }
    const render = (time: number) => {
      if (disposed || !renderer) return
      if (document.hidden) {
        frameRateMonitor.record(time, false)
        animationFrame = window.requestAnimationFrame(render)
        return
      }
      if (startTime === 0) startTime = time
      const deltaSeconds = previousFrameTime === 0 ? 0 : (time - previousFrameTime) / 1000
      previousFrameTime = time
      cameraController?.update(deltaSeconds)
      updateFogForFitDistance(camera.position.distanceTo(islandCenter))
      animateOcean((time - startTime) / 1000)
      renderer.render(scene, camera)
      publishFrameRate(frameRateMonitor.record(time), time)
      animationFrame = window.requestAnimationFrame(render)
    }
    cameraController = createCameraController({
      camera,
      element: renderer.domElement,
      islandCenter,
      movementBounds: new THREE.Box2(new THREE.Vector2(-terrainHalfWidth, -terrainHalfDepth), new THREE.Vector2(terrainHalfWidth, terrainHalfDepth)),
      minDistance: 54,
      maxDistance: 700,
    })
    const dispose = () => {
      if (disposed) return
      disposed = true
      cameraController?.dispose()
      cameraController = undefined
      revokeRockUrl()
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      options.onFrameRateUpdate?.({ state: 'paused', fps: null, frameTimeMs: null })
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          resources.add(object.geometry)
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => {
            resources.add(material)
            for (const value of Object.values(material)) {
              if (value instanceof THREE.Texture) value.dispose()
            }
          })
        }
      })
      for (const resource of resources) resource.dispose()
      renderer?.dispose()
      renderer?.domElement.remove()
      renderer = undefined
    }
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibilityChange)
    resize()
    render(0)
    return { resize, dispose }
  } catch (error) {
    disposed = true
    window.cancelAnimationFrame(animationFrame)
    renderer?.dispose()
    renderer?.domElement.remove()
    for (const resource of resources) resource.dispose()
    const detail = error instanceof Error ? error.message : String(error)
    onFatalError(`تعذّر تحميل مشهد الجزيرة. يرجى تحديث الصفحة أو المحاولة مرة أخرى. (${detail})`)
    return noop
  }
}
