import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import pineUrl from '../../assets/environment/trees/mature-scots-pine.glb?url'
import { createCameraController } from './CameraController'
import { createFrameRateMonitor, type FrameRateReading } from './FrameRateMonitor'
import { createIslandTerrain } from './terrain'
import { addGrass } from './grass'
import { addRocks, localRockDocumentUrl } from './rocks'
import { addTrees } from './trees'
import { addOcean } from './ocean'
import { createTerrainGeometry } from './terrainMesh'
import { addAnimals, addBirds } from './wildlife'
import { addShips } from './ships'
import { addInstances } from './environmentModels'

// Re-export modular components for backward compatibility and clean API access
export * from './grass'
export * from './rocks'
export * from './trees'
export * from './ocean'
export * from './terrainMesh'
export * from './wildlife'
export * from './ships'
export * from './environmentModels'

export type IslandSceneHandle = {
  resize(): void
  dispose(): void
}

export type IslandSceneOptions = {
  onFrameRateUpdate?: (reading: FrameRateReading) => void
}

const terrainSeed = 41723

/**
 * Orchestrates the 3D Island scene: initializes WebGL renderer, camera controller,
 * lighting, terrain, vegetation, ocean shaders, optional GLTF assets, and the main animation loop.
 */
export async function createIslandScene(
  container: HTMLElement,
  onFatalError: (message: string) => void,
  options: IslandSceneOptions = {},
): Promise<IslandSceneHandle> {
  const resources = new Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>()
  let renderer: THREE.WebGLRenderer | undefined
  let animationFrame = 0
  let startTime: number | null = null
  let animateOcean: (time: number) => void = () => {}
  let animateGrass: (time: number) => void = () => {}
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

    const camera = new THREE.PerspectiveCamera(
      42,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      2400,
    )
    const islandCenter = new THREE.Vector3(0, 1.6, 0)
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

    const createRendererWithFallback = () => {
      const candidates: THREE.WebGLRendererParameters[] = [
        { antialias: true, alpha: false, powerPreference: 'high-performance' },
        { antialias: false, alpha: false, powerPreference: 'default' },
        { antialias: false, powerPreference: 'low-power' },
        {},
      ]
      let lastErr: unknown
      for (const params of candidates) {
        try {
          return new THREE.WebGLRenderer(params)
        } catch (e) {
          lastErr = e
        }
      }
      throw lastErr
    }

    renderer = createRendererWithFallback()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.96
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = true
    container.appendChild(renderer.domElement)

    const hemisphere = new THREE.HemisphereLight(0xdbe9e5, 0x665b45, 1.25)
    scene.add(hemisphere)
    const sunlight = new THREE.DirectionalLight(0xffe0b2, 2.15)
    sunlight.position.set(-165, 170, -105)
    sunlight.castShadow = true
    sunlight.shadow.mapSize.set(2048, 2048)
    sunlight.shadow.camera.left = -250
    sunlight.shadow.camera.right = 250
    sunlight.shadow.camera.top = 250
    sunlight.shadow.camera.bottom = -250
    sunlight.shadow.camera.far = 600
    sunlight.shadow.bias = -0.0002
    scene.add(sunlight)
    const fill = new THREE.AmbientLight(0xc1d8d9, 0.22)
    scene.add(fill)

    const terrainGeometry = createTerrainGeometry(terrain)
    const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 })
    resources.add(terrainGeometry)
    resources.add(terrainMaterial)
    const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial)
    terrainMesh.receiveShadow = true
    terrainMesh.castShadow = true
    scene.add(terrainMesh)

    animateOcean = addOcean(scene, terrain, resources)
    animateGrass = addGrass(scene, terrain, resources)
    addRocks(scene, terrain, resources)
    const fallbackTreeMesh = addTrees(scene, terrain, resources)

    let animateAnimals: (time: number) => void = () => {}
    let animateBirds: (time: number) => void = () => {}
    let animateShips: (time: number) => void = () => {}

    const loader = new GLTFLoader()
    const rockUrl = localRockDocumentUrl()
    const models = [
      { url: pineUrl, label: 'mature scots pine', kind: 'tree' as const },
      { url: rockUrl, label: 'rock', kind: 'rock' as const },
    ]
    let rockUrlRevoked = false
    const revokeRockUrl = () => {
      if (rockUrlRevoked) return
      rockUrlRevoked = true
      URL.revokeObjectURL(rockUrl)
    }

    void Promise.all(
      models.map(async ({ url, label, kind }) => {
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
          if (kind === 'tree') {
            if (fallbackTreeMesh) fallbackTreeMesh.visible = false
            animateAnimals = addAnimals(scene, terrain, model)
            animateBirds = addBirds(scene, model)
          }
          if (kind === 'rock') {
            animateShips = addShips(scene, model)
          }
          if (renderer) renderer.shadowMap.needsUpdate = true
        } catch (error) {
          console.warn(`Optional environment ${label} model failed to load; terrain will remain available.`, error)
        } finally {
          if (url === rockUrl) revokeRockUrl()
        }
      }),
    )

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
      if (startTime === null) startTime = time
      const deltaSeconds = previousFrameTime === 0 ? 0 : (time - previousFrameTime) / 1000
      previousFrameTime = time
      cameraController?.update(deltaSeconds)
      updateFogForFitDistance(camera.position.distanceTo(islandCenter))
      animateOcean((time - startTime) / 1000)
      animateGrass((time - startTime) / 1000)
      animateAnimals((time - startTime) / 1000)
      animateBirds((time - startTime) / 1000)
      animateShips((time - startTime) / 1000)
      renderer.render(scene, camera)
      publishFrameRate(frameRateMonitor.record(time), time)
      animationFrame = window.requestAnimationFrame(render)
    }

    cameraController = createCameraController({
      camera,
      element: renderer.domElement,
      islandCenter,
      movementBounds: new THREE.Box2(
        new THREE.Vector2(-terrainHalfWidth, -terrainHalfDepth),
        new THREE.Vector2(terrainHalfWidth, terrainHalfDepth),
      ),
      minDistance: 54,
      maxDistance: Math.max(700, fitDistance * 1.5),
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
    console.error('IslandScene error:', error)
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
