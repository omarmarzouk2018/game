import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import pineUrl from '../../assets/environment/mature-scots-pine.glb?url'
import rockDocument from '../../assets/environment/rock-09/rock-09.gltf?raw'
import rockBufferUrl from '../../assets/environment/rock-09/rock_09.bin?url'
import rockNormalUrl from '../../assets/environment/rock-09/textures/rock_09_nor_gl_1k.jpg?url'
import rockDiffuseUrl from '../../assets/environment/rock-09/textures/rock_09_diff_1k.jpg?url'
import rockArmUrl from '../../assets/environment/rock-09/textures/rock_09_arm_1k.jpg?url'
import { createIslandTerrain, sampleIslandTerrain, type IslandTerrain } from './terrain'

export type IslandSceneHandle = {
  resize(): void
  dispose(): void
}

const terrainSeed = 41723
const oceanColor = 0x397c91
const treePositions = [
  [-39, 0], [-34, -10], [-31, 12], [-27, -18], [-24, 18], [-19, -26], [-15, 25], [-10, -31],
  [-5, 29], [2, -34], [8, 27], [14, -29], [20, 22], [27, -18], [33, 10], [38, -3],
  [-30, 30], [31, 29], [-38, 20], [39, -21], [-22, 34], [22, 35], [-36, -28], [36, -32],
] as const

function terrainAt(terrain: IslandTerrain, x: number, z: number) {
  return sampleIslandTerrain(terrain, x, z)
}

function makeTerrain(terrain: IslandTerrain): THREE.BufferGeometry {
  const side = terrain.segments + 1
  const positions = new Float32Array(side * side * 3)
  const colors = new Float32Array(side * side * 3)
  const lowland = new THREE.Color(0x59734c)
  const meadow = new THREE.Color(0x71805a)
  const highland = new THREE.Color(0x777461)
  const rock = new THREE.Color(0xaaa398)
  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      const index = row * side + column
      const height = terrain.heights[index]
      positions[index * 3] = (column / terrain.segments - 0.5) * terrain.width
      positions[index * 3 + 1] = height
      positions[index * 3 + 2] = (row / terrain.segments - 0.5) * terrain.depth
      const color = height < 0.08 ? new THREE.Color(0x9d9b79)
        : height < 0.28 ? lowland.clone().lerp(meadow, (height - 0.08) / 0.2)
          : height < 0.85 ? meadow.clone().lerp(highland, (height - 0.28) / 0.57)
            : highland.clone().lerp(rock, Math.min(1, (height - 0.85) / 1.1))
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

function localRockDocumentUrl(): string {
  const document = rockDocument
    .replace('"uri": "textures/rock_09_nor_gl_1k.jpg"', `"uri": "${rockNormalUrl}"`)
    .replace('"uri": "textures/rock_09_diff_1k.jpg"', `"uri": "${rockDiffuseUrl}"`)
    .replace('"uri": "textures/rock_09_arm_1k.jpg"', `"uri": "${rockArmUrl}"`)
    .replace('"uri": "rock_09.bin"', `"uri": "${rockBufferUrl}"`)
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
  const noop: IslandSceneHandle = { resize() {}, dispose() {} }
  try {
    const terrain = createIslandTerrain(terrainSeed)
    if (terrain.heights.length !== (terrain.segments + 1) ** 2 || terrain.landMask.length !== terrain.heights.length) {
      throw new Error('بيانات التضاريس غير مكتملة')
    }
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xc8d9d7)
    scene.fog = new THREE.Fog(0xc8d9d7, 95, 260)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600)
    camera.position.set(112, 100, -135)
    camera.lookAt(0, 0.35, 0)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    const hemisphere = new THREE.HemisphereLight(0xdbe9e5, 0x665b45, 2.0)
    scene.add(hemisphere)
    const sunlight = new THREE.DirectionalLight(0xffe0b2, 3.2)
    sunlight.position.set(-55, 85, -35)
    sunlight.castShadow = true
    sunlight.shadow.mapSize.set(2048, 2048)
    sunlight.shadow.camera.left = -70
    sunlight.shadow.camera.right = 70
    sunlight.shadow.camera.top = 70
    sunlight.shadow.camera.bottom = -70
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
      renderer.setSize(width, height, false)
    }
    const render = (time: number) => {
      if (disposed || !renderer) return
      if (startTime === 0) startTime = time
      animateOcean((time - startTime) / 1000)
      renderer.render(scene, camera)
      animationFrame = window.requestAnimationFrame(render)
    }
    const dispose = () => {
      if (disposed) return
      disposed = true
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
