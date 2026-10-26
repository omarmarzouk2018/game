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

export type IslandSceneHandle = {
  resize(): void
  dispose(): void
}

const terrainSeed = 41723
const oceanColor = 0x397c91
function terrainAt(terrain: IslandTerrain, x: number, z: number) {
  return sampleIslandTerrain(terrain, x, z)
}

export function createTreePlacements(terrain: IslandTerrain): Array<[number, number]> {
  const centers: Array<[number, number]> = [
    [-0.34, -0.18], [0.34, -0.18], [-0.38, 0.08], [0.38, 0.08],
    [-0.28, 0.32], [0.28, 0.32], [-0.1, 0.34], [0.1, 0.34],
  ]
  const placements: Array<[number, number]> = []
  centers.forEach(([centerX, centerZ], clusterIndex) => {
    for (let index = 0; index < 18; index += 1) {
      const angle = index * 2.399963229728653 + clusterIndex * 0.71
      const radius = 0.025 + (index % 6) * 0.017
      const x = (centerX + Math.cos(angle) * radius) * terrain.width / 2
      const z = (centerZ + Math.sin(angle) * radius) * terrain.depth / 2
      const sample = terrainAt(terrain, x, z)
      if (sample.land && sample.height <= 1.65 && !(Math.abs(x) < 13 && z < 22)) placements.push([x, z])
    }
  })
  return placements
}

function makeTerrain(terrain: IslandTerrain): THREE.BufferGeometry {
  const side = terrain.segments + 1
  const positions = new Float32Array(side * side * 3)
  const colors = new Float32Array(side * side * 3)
  const lowland = new THREE.Color(0x59734c)
  const meadow = new THREE.Color(0x71805a)
  const highland = new THREE.Color(0x777461)
  const rock = new THREE.Color(0xaaa398)
  const sea = new THREE.Color(oceanColor)
  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      const index = row * side + column
      const height = terrain.heights[index]
      positions[index * 3] = (column / terrain.segments - 0.5) * terrain.width
      positions[index * 3 + 1] = terrain.landMask[index] ? height : -0.08
      positions[index * 3 + 2] = (row / terrain.segments - 0.5) * terrain.depth
      const color = terrain.landMask[index]
        ? height < 0.08 ? new THREE.Color(0x9d9b79)
          : height < 0.28 ? lowland.clone().lerp(meadow, (height - 0.08) / 0.2)
            : height < 0.85 ? meadow.clone().lerp(highland, (height - 0.28) / 0.57)
              : highland.clone().lerp(rock, Math.min(1, (height - 0.85) / 1.1))
        : sea
      colors.set([color.r, color.g, color.b], index * 3)
    }
  }
  const indices: number[] = []
  for (let row = 0; row < terrain.segments; row += 1) {
    for (let column = 0; column < terrain.segments; column += 1) {
      const a = row * side + column
      const b = a + 1
      const c = a + side
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
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
    shader.vertexShader = `uniform float uOceanTime;\n${shader.vertexShader}`
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\ntransformed.z += sin(position.x * 0.045 + uOceanTime * 0.35) * 0.012 + sin(position.y * 0.06 - uOceanTime * 0.22) * 0.008;`,
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
    const treePositions = createTreePlacements(terrain)
    const placements = kind === 'tree' ? treePositions : treePositions.filter((_, index) => index % 3 === 0)
    for (const [x, z] of placements) {
      const sample = terrainAt(terrain, x, z)
      if (!sample.land || sample.height > 1.65 || (kind === 'tree' && Math.abs(x) < 13 && z < 22)) continue
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
): Promise<IslandSceneHandle> {
  const resources = new Set<THREE.Material | THREE.BufferGeometry>()
  let renderer: THREE.WebGLRenderer | undefined
  let animationFrame = 0
  let startTime = 0
  let animateOcean: (time: number) => void = () => {}
  let disposed = false
  let cameraController: ReturnType<typeof createCameraController> | undefined
  let previousFrameTime = 0
  const noop: IslandSceneHandle = { resize() {}, dispose() {} }
  try {
    const terrain = createIslandTerrain(terrainSeed)
    if (terrain.heights.length !== (terrain.segments + 1) ** 2 || terrain.landMask.length !== terrain.heights.length) {
      throw new Error('بيانات التضاريس غير مكتملة')
    }
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xc8d9d7)
    scene.fog = new THREE.Fog(0xc8d9d7, 180, 420)
    const camera = new THREE.PerspectiveCamera(42, Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight), 0.1, 1200)
    const islandCenter = new THREE.Vector3(0, 0.35, 0)
    const initialTilt = Math.acos(100 / Math.hypot(112, 100, 135))
    const initialAzimuth = Math.atan2(112, -135)
    const viewRadius = Math.hypot(82, 2.5, 82)
    const getFitDistance = (aspect: number) => {
      const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2)
      const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect)
      return viewRadius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov))
    }
    const fitDistance = getFitDistance(camera.aspect)
    const fog = scene.fog as THREE.Fog
    const updateFogForFitDistance = (distance: number) => {
      fog.near = Math.max(180, distance * 0.55)
      fog.far = Math.max(420, distance * 1.5)
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
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    container.appendChild(renderer.domElement)

    const hemisphere = new THREE.HemisphereLight(0xdbe9e5, 0x665b45, 2.0)
    scene.add(hemisphere)
    const sunlight = new THREE.DirectionalLight(0xffe0b2, 3.2)
    sunlight.position.set(-55, 85, -35)
    sunlight.castShadow = true
    sunlight.shadow.mapSize.set(2048, 2048)
    sunlight.shadow.camera.left = -75
    sunlight.shadow.camera.right = 75
    sunlight.shadow.camera.top = 75
    sunlight.shadow.camera.bottom = -75
    sunlight.shadow.bias = -0.0002
    scene.add(sunlight)
    const fill = new THREE.AmbientLight(0xc1d8d9, 0.35)
    scene.add(fill)

    const terrainGeometry = makeTerrain(terrain)
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
      }
      renderer.setSize(width, height, false)
    }
    const render = (time: number) => {
      if (disposed || !renderer) return
      if (startTime === 0) startTime = time
      const deltaSeconds = previousFrameTime === 0 ? 0 : (time - previousFrameTime) / 1000
      previousFrameTime = time
      cameraController?.update(deltaSeconds)
      animateOcean((time - startTime) / 1000)
      renderer.render(scene, camera)
      animationFrame = window.requestAnimationFrame(render)
    }
    cameraController = createCameraController({
      camera,
      element: renderer.domElement,
      islandCenter,
      movementBounds: new THREE.Box2(new THREE.Vector2(-68, -68), new THREE.Vector2(68, 68)),
      minDistance: 54,
      maxDistance: 250,
      onRenderRequested: () => {
        if (!disposed) renderer?.render(scene, camera)
      },
    })
    const dispose = () => {
      if (disposed) return
      disposed = true
      cameraController?.dispose()
      cameraController = undefined
      revokeRockUrl()
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', resize)
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
