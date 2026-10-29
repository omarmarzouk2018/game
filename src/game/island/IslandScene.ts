import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import pineUrl from '../../assets/environment/trees/mature-scots-pine.glb?url'
import { createCameraController } from '../camera'
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
import { LevelOfDetailManager } from './lodManager'
import { RoadNetwork } from '../roads/RoadNetwork'
import { RoadBuilder } from '../roads/RoadBuilder'
import { RoadRenderer } from '../roads/RoadRenderer'
import { EconomyManager } from '../economy/EconomyManager'
import { BuildingManager } from '../buildings/BuildingManager'
import { BuildingValidator } from '../buildings/BuildingValidator'
import { BuildingPlacement } from '../buildings/BuildingPlacement'
import { BuildingRenderer } from '../buildings/BuildingRenderer'

// Re-export modular components for backward compatibility and clean API access
export * from './grass'
export * from './rocks'
export * from './trees'
export * from './ocean'
export * from './terrainMesh'
export * from './wildlife'
export * from './ships'
export * from './environmentModels'
export * from './lodManager'
export * from '../buildings'

export type IslandSceneHandle = {
  resize(): void
  dispose(): void
  roadNetwork: RoadNetwork
  roadBuilder: RoadBuilder
  economyManager: EconomyManager
  lodManager: LevelOfDetailManager
  buildingManager: BuildingManager
  buildingPlacement: BuildingPlacement
}

export type IslandSceneOptions = {
  onFrameRateUpdate?: (reading: FrameRateReading) => void
  roadNetwork?: RoadNetwork
  roadBuilder?: RoadBuilder
  economyManager?: EconomyManager
  buildingManager?: BuildingManager
  buildingPlacement?: BuildingPlacement
}

const terrainSeed = 41723

/**
 * Orchestrates the 3D Island scene: initializes WebGL renderer, camera controller,
 * lighting, terrain, vegetation, ocean shaders, optional GLTF assets, roads, and the main animation loop.
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
  let initialFrameRatePublished = false
  const frameRateMonitor = createFrameRateMonitor()

  const defaultEconomy = options.economyManager ?? new EconomyManager(500)
  const defaultRoadNetwork = options.roadNetwork ?? new RoadNetwork()
  const defaultBuildingManager = options.buildingManager ?? new BuildingManager()
  const defaultBuildingValidator = new BuildingValidator()
  const fallbackTerrain = { width: 0, depth: 0, segments: 0, heights: new Float32Array(0), landMask: new Uint8Array(0) }
  const defaultBuildingPlacement = options.buildingPlacement ?? new BuildingPlacement(
    fallbackTerrain,
    defaultBuildingManager,
    defaultRoadNetwork,
    defaultEconomy,
    defaultBuildingValidator,
  )

  const noop: IslandSceneHandle = {
    resize() {},
    dispose() {},
    roadNetwork: defaultRoadNetwork,
    roadBuilder: options.roadBuilder ?? new RoadBuilder(fallbackTerrain, defaultRoadNetwork, defaultEconomy),
    economyManager: defaultEconomy,
    lodManager: new LevelOfDetailManager(),
    buildingManager: defaultBuildingManager,
    buildingPlacement: defaultBuildingPlacement,
  }

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
      throw lastErr || new Error('تعذّر تهيئة WebGL على هذا الجهاز أو المتصفح.')
    }

    renderer = createRendererWithFallback()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
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
    terrainMesh.name = 'TerrainMesh'
    terrainMesh.receiveShadow = true
    terrainMesh.castShadow = true
    scene.add(terrainMesh)

    // Road & Building System Integration
    const economyManager = defaultEconomy
    const roadNetwork = defaultRoadNetwork
    const roadBuilder = options.roadBuilder ?? new RoadBuilder(terrain, roadNetwork, economyManager)
    const roadRenderer = new RoadRenderer(scene, terrain, roadNetwork, roadBuilder)

    const buildingManager = options.buildingManager ?? defaultBuildingManager
    const buildingPlacement = options.buildingPlacement ?? new BuildingPlacement(
      terrain,
      buildingManager,
      roadNetwork,
      economyManager,
      defaultBuildingValidator,
    )
    const buildingRenderer = new BuildingRenderer(scene, terrain, buildingManager, buildingPlacement)

    const lodManager = new LevelOfDetailManager()
    let pbrTreeMeshes: THREE.InstancedMesh[] | null = null
    let pbrRockMeshes: THREE.InstancedMesh[] | null = null

    animateOcean = addOcean(scene, terrain, resources)
    const grassResult = addGrass(scene, terrain, resources, roadNetwork, buildingManager)
    animateGrass = grassResult
    const grassMesh = (grassResult as unknown as { mesh?: THREE.InstancedMesh }).mesh ?? null
    const farGrassMesh = (grassResult as unknown as { farMesh?: THREE.InstancedMesh }).farMesh ?? null
    const fallbackRockMeshes = addRocks(scene, terrain, resources)
    const fallbackTreeMesh = addTrees(scene, terrain, resources)

    const animateAnimals = addAnimals(scene, terrain, undefined, resources)
    const animateBirds = addBirds(scene, undefined, resources)
    const animateShips = addShips(scene, undefined, resources)

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const getTerrainIntersection = (event: MouseEvent): THREE.Vector3 | null => {
      if (!renderer) return null
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      camera.updateMatrixWorld()
      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObject(terrainMesh, false)
      if (intersects.length > 0) {
        return intersects[0].point
      }
      return null
    }

    let rightPointerDownPos: { x: number; y: number } | null = null
    let lastPointerX = 0
    let lastPointerY = 0

    const onScenePointerDown = (event: PointerEvent) => {
      if (event.button === 2) {
        rightPointerDownPos = { x: event.clientX, y: event.clientY }
        return
      }
      if (event.button !== 0 || event.ctrlKey) return
      const hit = getTerrainIntersection(event)
      if (!hit) return

      if (roadBuilder.isActive()) {
        lastPointerX = event.clientX
        lastPointerY = event.clientY
        roadBuilder.startDrag(hit.x, hit.z)
      } else if (buildingPlacement.isActive()) {
        buildingPlacement.commit()
      }
    }

    const onScenePointerMove = (event: PointerEvent) => {
      lastPointerX = event.clientX
      lastPointerY = event.clientY
      const hit = getTerrainIntersection(event)
      if (hit) {
        if (roadBuilder.isActive()) {
          if (roadBuilder.isDragging()) {
            roadBuilder.updateDrag(hit.x, hit.z)
          } else {
            roadBuilder.updateHover(hit.x, hit.z)
          }
        } else if (buildingPlacement.isActive()) {
          buildingPlacement.updateHover(hit.x, hit.z)
        }
      }
    }

    const onGlobalPointerMove = (event: PointerEvent) => {
      lastPointerX = event.clientX
      lastPointerY = event.clientY
      if (roadBuilder.isActive() || buildingPlacement.isActive()) {
        const hit = getTerrainIntersection(event)
        if (hit) {
          if (roadBuilder.isActive() && !roadBuilder.isDragging()) {
            roadBuilder.updateHover(hit.x, hit.z)
          } else if (buildingPlacement.isActive()) {
            buildingPlacement.updateHover(hit.x, hit.z)
          }
        }
      }
    }

    const onScenePointerUp = (event: PointerEvent) => {
      if (!roadBuilder.isActive() || event.button !== 0) return
      if (roadBuilder.isDragging()) {
        roadBuilder.commit()
      }
    }

    const onSceneContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      if (rightPointerDownPos) {
        const dist = Math.hypot(event.clientX - rightPointerDownPos.x, event.clientY - rightPointerDownPos.y)
        rightPointerDownPos = null
        if (dist > 6) {
          return
        }
      }
      if (roadBuilder.isActive()) {
        if (roadBuilder.isDragging()) {
          roadBuilder.cancelDrag()
        } else {
          roadBuilder.deactivate()
        }
      } else if (buildingPlacement.isActive()) {
        buildingPlacement.deactivate()
      }
    }

    const updateCursor = () => {
      if (renderer) {
        const isToolActive = roadBuilder.isActive() || buildingPlacement.isActive()
        renderer.domElement.style.cursor = isToolActive ? 'crosshair' : 'grab'
        if (isToolActive) {
          const clientX = lastPointerX > 0 ? lastPointerX : container.clientWidth / 2
          const clientY = lastPointerY > 0 ? lastPointerY : container.clientHeight / 2
          const hit = getTerrainIntersection({ clientX, clientY } as MouseEvent)
          if (hit) {
            if (roadBuilder.isActive() && !roadBuilder.isDragging()) {
              roadBuilder.updateHover(hit.x, hit.z)
            } else if (buildingPlacement.isActive()) {
              buildingPlacement.updateHover(hit.x, hit.z)
            }
          }
        }
      }
    }

    const unsubscribeBuilder = roadBuilder.subscribe(updateCursor)
    const unsubscribeBuildingPlacement = buildingPlacement.subscribe(updateCursor)

    renderer.domElement.addEventListener('pointerdown', onScenePointerDown)
    renderer.domElement.addEventListener('pointermove', onScenePointerMove)
    renderer.domElement.addEventListener('pointerup', onScenePointerUp)
    renderer.domElement.addEventListener('contextmenu', onSceneContextMenu)
    window.addEventListener('pointermove', onGlobalPointerMove)

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
          const createdMeshes = addInstances(scene, model, terrain, resources, kind)
          if (kind === 'tree') {
            pbrTreeMeshes = createdMeshes
          } else {
            pbrRockMeshes = createdMeshes
          }
          const currentTarget = (camera.userData.islandCameraTarget as THREE.Vector3) || islandCenter
          const currentCameraDist = camera.position.distanceTo(currentTarget)
          lodManager.update(currentCameraDist, {
            grassMesh,
            farGrassMesh,
            fallbackTreeMesh,
            fallbackRockMeshes,
            pbrTreeMeshes,
            pbrRockMeshes,
          })
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

    let renderCount = 0
    const render = (time: number) => {
      if (disposed || !renderer) return
      if (document.hidden) {
        frameRateMonitor.record(time, false)
        animationFrame = window.requestAnimationFrame(render)
        return
      }
      renderCount++
      if (startTime === null) startTime = time
      const deltaSeconds = previousFrameTime === 0 ? 0 : (time - previousFrameTime) / 1000
      previousFrameTime = time

      if (!initialFrameRatePublished && renderCount >= 3 && deltaSeconds > 0) {
        initialFrameRatePublished = true
        const initialFps = Math.max(1, Math.min(120, Math.round(1 / deltaSeconds)))
        publishFrameRate({
          state: 'active',
          fps: initialFps,
          frameTimeMs: Number((deltaSeconds * 1000).toFixed(1)),
        }, time)
      }
      cameraController?.update(deltaSeconds)
      if (roadBuilder.isDragging() && renderer && deltaSeconds > 0) {
        const rect = renderer.domElement.getBoundingClientRect()
        const margin = 35
        const edgePanSpeed = 35
        let panX = 0
        let panY = 0
        if (lastPointerX >= rect.left && lastPointerX <= rect.left + margin) panX = -1
        else if (lastPointerX <= rect.right && lastPointerX >= rect.right - margin) panX = 1
        if (lastPointerY >= rect.top && lastPointerY <= rect.top + margin) panY = -1
        else if (lastPointerY <= rect.bottom && lastPointerY >= rect.bottom - margin) panY = 1

        if (panX !== 0 || panY !== 0) {
          cameraController?.panRelative(panX * edgePanSpeed * deltaSeconds, panY * edgePanSpeed * deltaSeconds)
        }
        const hit = getTerrainIntersection({ clientX: lastPointerX, clientY: lastPointerY } as MouseEvent)
        if (hit) {
          roadBuilder.updateDrag(hit.x, hit.z)
        }
      }
      const currentTarget = (camera.userData.islandCameraTarget as THREE.Vector3) || islandCenter
      const currentCameraDist = camera.position.distanceTo(currentTarget)
      lodManager.update(currentCameraDist, {
        grassMesh,
        farGrassMesh,
        fallbackTreeMesh,
        fallbackRockMeshes,
        pbrTreeMeshes,
        pbrRockMeshes,
      })
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
      isInteractionActive: () => roadBuilder.isActive() || buildingPlacement.isActive(),
    })

    const dispose = () => {
      if (disposed) return
      disposed = true
      cameraController?.dispose()
      cameraController = undefined
      unsubscribeBuilder()
      unsubscribeBuildingPlacement()
      roadRenderer.dispose()
      buildingRenderer.dispose()
      if (renderer) {
        renderer.domElement.removeEventListener('pointerdown', onScenePointerDown)
        renderer.domElement.removeEventListener('pointermove', onScenePointerMove)
        renderer.domElement.removeEventListener('pointerup', onScenePointerUp)
        renderer.domElement.removeEventListener('contextmenu', onSceneContextMenu)
      }
      window.removeEventListener('pointermove', onGlobalPointerMove)
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

    return {
      resize,
      dispose,
      roadNetwork,
      roadBuilder,
      economyManager,
      lodManager,
      buildingManager,
      buildingPlacement,
    }
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
