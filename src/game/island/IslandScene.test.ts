import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rendererState = vi.hoisted(() => ({
  instances: [] as Array<{ domElement: HTMLCanvasElement; setSize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; setPixelRatio: ReturnType<typeof vi.fn>; shadowMap: { enabled: boolean; type: number; autoUpdate: boolean; needsUpdate: boolean } }>,
  failConstruction: false,
  loadFails: new Set<string>(),
  loadedUrls: [] as string[],
  pendingLoads: new Map<string, (result: { scene: import('three').Group }) => void>(),
  deferLoads: false,
  renderArgs: [] as unknown[][],
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class MockWebGLRenderer {
    domElement = document.createElement('canvas')
    setSize = vi.fn()
    dispose = vi.fn()
    render = vi.fn((...args: unknown[]) => { rendererState.renderArgs.push(args) })
    setPixelRatio = vi.fn()
    shadowMap = { enabled: false, type: 0, autoUpdate: true, needsUpdate: false }
    constructor() {
      if (rendererState.failConstruction) throw new Error('WebGL unavailable')
      rendererState.instances.push(this)
    }
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer }
})

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    async loadAsync(url: string) {
      rendererState.loadedUrls.push(url)
      if ([...rendererState.loadFails].some((assetName) => url.includes(assetName))) throw new Error(`failed ${url}`)
      const { Group } = await import('three')
      if (rendererState.deferLoads) {
        return new Promise((resolve) => rendererState.pendingLoads.set(url, (result) => resolve(result)))
      }
      return { scene: new Group() }
    }
  },
}))

import * as THREE from 'three'
import rockDocument from '../../assets/environment/rock-09/rock-09.gltf?raw'
import rockBufferUrl from '../../assets/environment/rock-09/rock_09.bin?url'
import rockNormalUrl from '../../assets/environment/rock-09/textures/rock_09_nor_gl_1k.jpg?url'
import rockDiffuseUrl from '../../assets/environment/rock-09/textures/rock_09_diff_1k.jpg?url'
import rockArmUrl from '../../assets/environment/rock-09/textures/rock_09_arm_1k.jpg?url'
import {
  createGrassGeometry,
  createGrassPlacements,
  createIslandScene,
  createRockGeometry,
  createRockPlacements,
  createTerrainGeometry,
  createTreeGeometry,
  createForestPlacements,
  rewriteRockDocument,
} from './IslandScene'
import * as terrainModule from './terrain'

function makeContainer(width: number, height: number) {
  const container = document.createElement('div')
  Object.defineProperties(container, {
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height },
  })
  document.body.append(container)
  return container
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  rendererState.instances.length = 0
  rendererState.failConstruction = false
  rendererState.loadFails.clear()
  rendererState.pendingLoads.clear()
  rendererState.deferLoads = false
  rendererState.loadedUrls.length = 0
  rendererState.renderArgs.length = 0
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('createIslandScene lifecycle', () => {
  it('returns a disposable handle while optional model loads are pending', async () => {
    rendererState.deferLoads = true
    const container = makeContainer(840, 540)
    const handlePromise = createIslandScene(container, vi.fn())
    expect(handlePromise).toBeInstanceOf(Promise)
    const handle = await handlePromise
    expect(handle).toHaveProperty('dispose')
    expect(container.querySelector('canvas')).not.toBeNull()
    await vi.waitFor(() => expect(rendererState.pendingLoads.size).toBe(2))
    handle.dispose()
    const { Group } = await import('three')
    for (const resolve of rendererState.pendingLoads.values()) resolve({ scene: new Group() })
  })

  it('does not render after disposal and releases late model resources and blob URLs', async () => {
    rendererState.deferLoads = true
    const container = makeContainer(840, 540)
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL')
    const handlePromise = createIslandScene(container, vi.fn())
    expect(handlePromise).toBeInstanceOf(Promise)
    const handle = await handlePromise
    await vi.waitFor(() => expect(rendererState.pendingLoads.size).toBe(2))
    const renderer = rendererState.instances[0]
    const renderCount = renderer.render.mock.calls.length
    const { Group, Mesh, BoxGeometry, MeshBasicMaterial } = await import('three')
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeMaterial = vi.spyOn(material, 'dispose')
    const blobUrl = rendererState.loadedUrls.find((url) => url.startsWith('blob:'))!

    handle.dispose()
    for (const [url, resolve] of rendererState.pendingLoads) {
      const loadedModel = new Group()
      if (url === blobUrl) loadedModel.add(new Mesh(geometry, material))
      resolve({ scene: loadedModel })
    }
    await vi.waitFor(() => expect(disposeGeometry).toHaveBeenCalled())
    vi.mocked(requestAnimationFrame).mock.calls.at(-1)?.[0](16)

    expect(renderer.render).toHaveBeenCalledTimes(renderCount)
    expect(disposeGeometry).toHaveBeenCalledOnce()
    expect(disposeMaterial).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith(blobUrl)
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('rewrites every rock sidecar URI to its imported bundled URL', () => {
    const document = rewriteRockDocument(rockDocument.replaceAll('"uri":', '"uri"  :  '))
    const parsed = JSON.parse(document) as { buffers: Array<{ uri: string }>; images: Array<{ uri: string }> }
    const uris = [...parsed.buffers.map(({ uri }) => uri), ...parsed.images.map(({ uri }) => uri)]

    const importedUrls = [rockBufferUrl, rockNormalUrl, rockDiffuseUrl, rockArmUrl]
    expect(uris).toEqual(importedUrls.map((url) => new URL(url, window.document.baseURI).href))
    expect(uris.every((uri) => new URL(uri).origin === new URL(window.document.baseURI).origin)).toBe(true)
    expect(uris.map((uri) => new URL(uri, 'blob:http://localhost/rock-document').href)).toEqual(uris)
    expect(uris).not.toContain('rock_09.bin')
    expect(uris).not.toContain('textures/rock_09_nor_gl_1k.jpg')
    expect(uris).not.toContain('textures/rock_09_diff_1k.jpg')
    expect(uris).not.toContain('textures/rock_09_arm_1k.jpg')
  })

  it('places the ocean surface exactly at sea level zero', async () => {
    const handle = await createIslandScene(makeContainer(840, 540), vi.fn())
    const scene = rendererState.renderArgs[0][0] as THREE.Scene
    const ocean = scene.children.find((child): child is THREE.Mesh =>
      child instanceof THREE.Mesh && child.geometry.getAttribute('color') === undefined,
    )

    expect(ocean).toBeDefined()
    expect(ocean!.position.y).toBe(0)
    handle.dispose()
  })

  it('keeps the water color out of the clipped island terrain', async () => {
    const handle = await createIslandScene(makeContainer(840, 540), vi.fn())
    const scene = rendererState.renderArgs[0][0] as THREE.Scene
    const geometry = scene.children
      .filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)
      .map((mesh) => mesh.geometry)
      .find((candidate) => candidate.getAttribute('color') !== undefined)
    expect(geometry).toBeDefined()
    const terrainGeometry = geometry!
    const position = terrainGeometry.getAttribute('position')
    const color = terrainGeometry.getAttribute('color')
    const oceanVertexColor = new THREE.Color(0x397c91)
    for (let i = 0; i < position.count; i += 1) {
      expect(position.getY(i)).toBeGreaterThanOrEqual(-5.81)
      const colorDistance = Math.hypot(
        color.getX(i) - oceanVertexColor.r,
        color.getY(i) - oceanVertexColor.g,
        color.getZ(i) - oceanVertexColor.b,
      )
      expect(colorDistance).toBeGreaterThan(0.01)
    }
    handle.dispose()
  })

  it('places rocks selectively on exposed mountain slopes rather than filtering tree positions', () => {
    const terrain = terrainModule.createIslandTerrain(41723)
    const placements = createRockPlacements(terrain)
    expect(placements.length).toBeGreaterThan(0)
    expect(placements.length).toBeLessThan(terrain.segments * terrain.segments / 12)
    expect(placements.every(([x, z]) => terrainModule.sampleIslandTerrain(terrain, x, z).height > 0.9)).toBe(true)
  })

  it('continues the shoreline slope below sea level while excluding deep-water faces', () => {
    const terrain = terrainModule.createIslandTerrain(41723)
    const geometry = createTerrainGeometry(terrain)
    const positions = geometry.getAttribute('position')
    const indices = geometry.getIndex()
    const heights = Array.from({ length: positions.count }, (_, index) => positions.getY(index))

    expect(indices).not.toBeNull()
    expect(indices!.count).toBeGreaterThan(0)
    expect(heights.every(Number.isFinite)).toBe(true)
    expect(Math.min(...heights)).toBeLessThan(-0.1)
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(-5.81)
    expect(Math.max(...heights)).toBeGreaterThan(0)
    for (let index = 0; index < indices!.count; index += 1) {
      expect(indices!.getX(index)).toBeLessThan(positions.count)
    }
    geometry.dispose()
  })

  it('publishes render-frame rate readings from the animation loop', async () => {
    const onFrameRateUpdate = vi.fn()
    const handle = await createIslandScene(makeContainer(840, 540), vi.fn(), { onFrameRateUpdate })
    for (let time = 16; time <= 1008; time += 16) {
      vi.mocked(requestAnimationFrame).mock.calls.at(-1)?.[0](time)
    }

    expect(onFrameRateUpdate).toHaveBeenCalledWith(expect.objectContaining({ state: 'active', fps: expect.any(Number), frameTimeMs: expect.any(Number) }))
    handle.dispose()
    expect(onFrameRateUpdate).toHaveBeenLastCalledWith({ state: 'paused', fps: null, frameTimeMs: null })
  })

  it('configures terrain mesh and material with roughness 0.85, metalness 0.05, and shadow reception', async () => {
    const handle = await createIslandScene(makeContainer(840, 540), vi.fn())
    const scene = rendererState.renderArgs[0][0] as THREE.Scene
    const terrainMesh = scene.children.find((child): child is THREE.Mesh =>
      child instanceof THREE.Mesh && child.geometry.getAttribute('color') !== undefined,
    )

    expect(terrainMesh).toBeDefined()
    expect(terrainMesh!.receiveShadow).toBe(true)
    const material = terrainMesh!.material as THREE.MeshStandardMaterial
    expect(material.vertexColors).toBe(true)
    expect(material.roughness).toBeCloseTo(0.85, 2)
    expect(material.metalness).toBeCloseTo(0.05, 2)
    handle.dispose()
  })

  it('colors terrain geometry with sand, rich grass, steep cliff rock, and snow at peaks', () => {
    const terrain = terrainModule.createIslandTerrain(41723, 256)
    const geometry = createTerrainGeometry(terrain)
    const positions = geometry.getAttribute('position')
    const colors = geometry.getAttribute('color')
    expect(positions.count).toBeGreaterThan(40000)

    let foundSand = false
    let foundGrass = false
    let foundRockOrCliff = false
    let foundSnowCap = false
    let snowBelowCap = false
    let maxHeight = 0
    for (let i = 0; i < positions.count; i += 1) {
      maxHeight = Math.max(maxHeight, positions.getY(i))
    }
    const snowCapFloor = maxHeight * 0.72
    const snowFull = maxHeight * 0.95

    const sandColor = new THREE.Color(0xd4b886)
    const grassColor = new THREE.Color(0x4a7c34)
    const snowColor = new THREE.Color(0xc8d0d4)
    const cliffColor = new THREE.Color(0x6b6e6b)

    for (let i = 0; i < positions.count; i += 1) {
      const y = positions.getY(i)
      const r = colors.getX(i)
      const g = colors.getY(i)
      const b = colors.getZ(i)

      if (y >= 0.2 && y <= 1.0) {
        if (Math.hypot(r - sandColor.r, g - sandColor.g, b - sandColor.b) < 0.25) {
          foundSand = true
        }
      } else if (y >= 2.0 && y <= 6.0) {
        if (Math.hypot(r - grassColor.r, g - grassColor.g, b - grassColor.b) < 0.25) {
          foundGrass = true
        }
      } else if (y >= 14.0 && y <= 21.0) {
        if (Math.hypot(r - cliffColor.r, g - cliffColor.g, b - cliffColor.b) < 0.25) {
          foundRockOrCliff = true
        }
      } else if (y > 22.5 && y < snowCapFloor) {
        if (Math.hypot(r - snowColor.r, g - snowColor.g, b - snowColor.b) < 0.25) {
          snowBelowCap = true
        }
      } else if (y >= snowCapFloor) {
        if (Math.hypot(r - snowColor.r, g - snowColor.g, b - snowColor.b) < 0.35) {
          foundSnowCap = true
        }
      }
    }

    expect(foundSand).toBe(true)
    expect(foundGrass).toBe(true)
    expect(foundRockOrCliff).toBe(true)
    expect(snowBelowCap).toBe(false)
    expect(foundSnowCap).toBe(true)
    geometry.dispose()
  })

  it('keeps static shadows cached until scene content changes', async () => {
    const handle = await createIslandScene(makeContainer(840, 540), vi.fn())

    expect(rendererState.instances[0].shadowMap.autoUpdate).toBe(false)
    expect(rendererState.instances[0].shadowMap.needsUpdate).toBe(true)

    handle.dispose()
  })

  it('refreshes cached shadows after optional scene models load', async () => {
    rendererState.deferLoads = true
    const handle = await createIslandScene(makeContainer(840, 540), vi.fn())
    const shadowMap = rendererState.instances[0].shadowMap
    shadowMap.needsUpdate = false
    const { Group } = await import('three')
    for (const resolve of rendererState.pendingLoads.values()) resolve({ scene: new Group() })

    await vi.waitFor(() => expect(shadowMap.needsUpdate).toBe(true))
    handle.dispose()
  })

  it('appends a canvas and sizes the renderer from the active container', async () => {
    const container = makeContainer(840, 540)
    const handle = await createIslandScene(container, vi.fn())
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(canvas?.style.width).toBe('100%')
    expect(canvas?.style.height).toBe('100%')
    expect(rendererState.loadedUrls.some((url) => url.includes('mature-scots-pine.glb'))).toBe(true)
    expect(rendererState.loadedUrls.some((url) => url.startsWith('blob:'))).toBe(true)
    expect(rendererState.instances[0].setSize).toHaveBeenCalledWith(840, 540, false)
    handle.dispose()
  })

  it('resizes from the active container and preserves full-island framing in a narrow viewport', async () => {
    const container = makeContainer(800, 600)
    const handle = await createIslandScene(container, vi.fn())
    const scene = rendererState.renderArgs[0][0] as THREE.Scene
    const camera = rendererState.renderArgs[0][1] as THREE.PerspectiveCamera
    const terrain = terrainModule.createIslandTerrain(41723)
    const target = camera.userData.islandCameraTarget as THREE.Vector3
    const maximumHeight = Math.max(...terrain.heights)
    const initialFitDistance = Math.hypot(terrain.width / 2, maximumHeight - target.y, terrain.depth / 2) / Math.sin(THREE.MathUtils.degToRad(21))
    const initialCameraOffset = camera.position.clone().sub(target)
    expect(initialCameraOffset.length()).toBeGreaterThanOrEqual(initialFitDistance - 0.01)
    const initialPolarAngle = Math.acos(initialCameraOffset.y / initialCameraOffset.length())
    expect(initialPolarAngle).toBeGreaterThan(1.15)
    expect(initialPolarAngle).toBeLessThan(1.4)
    expect((scene.fog as THREE.Fog).near).toBeGreaterThanOrEqual(initialFitDistance)
    expect((scene.fog as THREE.Fog).far).toBeGreaterThanOrEqual(initialFitDistance * 1.5)

    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 300 })
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 800 })
    window.dispatchEvent(new Event('resize'))
    expect(rendererState.instances[0].setSize).toHaveBeenLastCalledWith(300, 800, false)
    const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2)
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * (300 / 800))
    const narrowFitDistance = Math.hypot(terrain.width / 2, maximumHeight - target.y, terrain.depth / 2) / Math.sin(horizontalHalfFov)
    expect(camera.position.distanceTo(target)).toBeGreaterThanOrEqual(narrowFitDistance - 0.01)
    expect((scene.fog as THREE.Fog).far).toBeGreaterThanOrEqual(narrowFitDistance * 1.5)
    handle.dispose()
  })

  it('defers wheel interaction rendering to the next animation frame', async () => {
    const handle = await createIslandScene(makeContainer(840, 540), vi.fn())
    const renderer = rendererState.instances[0]
    const renderCount = renderer.render.mock.calls.length
    renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))

    expect(renderer.render).toHaveBeenCalledTimes(renderCount)
    handle.dispose()
  })

  it('extends fog visibility when the camera zooms farther out', async () => {
    const container = makeContainer(840, 540)
    const handle = await createIslandScene(container, vi.fn())
    const scene = rendererState.renderArgs[0][0] as THREE.Scene
    const camera = rendererState.renderArgs[0][1] as THREE.PerspectiveCamera
    const canvas = rendererState.instances[0].domElement
    const initialFar = (scene.fog as THREE.Fog).far

    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 1000, bubbles: true, cancelable: true }))
    vi.mocked(requestAnimationFrame).mock.calls.at(-1)?.[0](16)
    vi.mocked(requestAnimationFrame).mock.calls.at(-1)?.[0](1000)

    expect(camera.position.distanceTo(new THREE.Vector3(0, 0.35, 0))).toBeGreaterThan(300)
    expect((scene.fog as THREE.Fog).far).toBeGreaterThan(initialFar)
    handle.dispose()
  })

  it('removes its canvas and resize listener on disposal', async () => {
    const container = makeContainer(800, 600)
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const handle = await createIslandScene(container, vi.fn())
    handle.dispose()
    expect(container.querySelector('canvas')).toBeNull()
    expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(rendererState.instances[0].dispose).toHaveBeenCalledOnce()
  })

  it('fails gracefully when required terrain generation fails', async () => {
    const onFatalError = vi.fn()
    vi.spyOn(terrainModule, 'createIslandTerrain').mockImplementation(() => { throw new Error('bad terrain') })
    const handle = await createIslandScene(makeContainer(800, 600), onFatalError)
    expect(onFatalError).toHaveBeenCalledOnce()
    expect(onFatalError.mock.calls[0][0]).toMatch(/[؀-ۿ]/)
    expect(rendererState.instances).toHaveLength(0)
    handle.dispose()
  })

  it('reports renderer initialization failures in readable Arabic', async () => {
    rendererState.failConstruction = true
    const onFatalError = vi.fn()
    const handle = await createIslandScene(makeContainer(800, 600), onFatalError)
    expect(onFatalError).toHaveBeenCalledOnce()
    expect(onFatalError.mock.calls[0][0]).toMatch(/[؀-ۿ]/)
    expect(handle.dispose).toBeTypeOf('function')
  })

  it('continues rendering when an optional environment model fails', async () => {
    rendererState.loadFails.add('mature-scots-pine.glb')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handle = await createIslandScene(makeContainer(800, 600), vi.fn())
    expect(warn).toHaveBeenCalled()
    expect(rendererState.instances[0].render).toHaveBeenCalled()
    handle.dispose()
  })

  describe('Phase 4: Grass instancing and wind sway', () => {
    it('generates ready 3D grass model geometry with root-to-tip vertex color gradient', () => {
      const geometry = createGrassGeometry()
      expect(geometry).toBeInstanceOf(THREE.BufferGeometry)
      const positions = geometry.getAttribute('position')
      const colors = geometry.getAttribute('color')
      const indices = geometry.getIndex()

      expect(positions).toBeDefined()
      expect(colors).toBeDefined()
      expect(indices).not.toBeNull()
      // Ready 3D grass clump model from CC0 asset: 408 vertices and 576 indices (192 triangles)
      expect(positions.count).toBe(408)
      expect(indices!.count).toBe(576)

      // Verify root-to-tip color gradient: bottom vertices (y <= 0.05) vs top vertices (y > 0.4)
      let bottomVertexFound = false
      let topVertexFound = false
      let bottomBrightness = 0
      let topBrightness = 0

      for (let i = 0; i < positions.count; i += 1) {
        const y = positions.getY(i)
        const r = colors.getX(i)
        const g = colors.getY(i)
        const b = colors.getZ(i)
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b

        if (y <= 0.05) {
          bottomVertexFound = true
          bottomBrightness = brightness
        } else if (y > 0.4) {
          topVertexFound = true
          topBrightness = brightness
        }
      }

      expect(bottomVertexFound).toBe(true)
      expect(topVertexFound).toBe(true)
      // Top tip should be brighter/sun-lit compared to the darker root
      expect(topBrightness).toBeGreaterThan(bottomBrightness)
      geometry.dispose()
    })


    it('generates deterministic grass placements on fertile land, avoiding beach, water, and cliffs', () => {
      const terrain = terrainModule.createIslandTerrain(41723)
      const placements1 = createGrassPlacements(terrain)
      const placements2 = createGrassPlacements(terrain)

      expect(placements1).toEqual(placements2)
      // Dense island grass coverage
      expect(placements1.length).toBeGreaterThanOrEqual(1500)

      for (const [x, z] of placements1) {
        const sample = terrainModule.sampleIslandTerrain(terrain, x, z)
        // Must be on land
        expect(sample.land).toBe(true)
        // Above beach sand (>= 1.2)
        expect(sample.height).toBeGreaterThanOrEqual(1.2)
        // Below barren alpine peaks (<= 10.0)
        expect(sample.height).toBeLessThanOrEqual(10.0)
        // Gentle to moderate slope (< 20°)
        const slope = terrainModule.sampleTerrainSlope(terrain, x, z)
        expect(slope).toBeLessThan(20.0)
      }
    })

    it('populates an InstancedMesh in the scene with double-sided material and wind animation', async () => {
      const handle = await createIslandScene(makeContainer(840, 540), vi.fn())
      const scene = rendererState.renderArgs[0][0] as THREE.Scene
      const grassMesh = scene.children.find((child): child is THREE.InstancedMesh =>
        child instanceof THREE.InstancedMesh && child.geometry.getAttribute('color') !== undefined,
      )

      expect(grassMesh).toBeDefined()
      expect(grassMesh!.count).toBeGreaterThanOrEqual(1500)
      expect(grassMesh!.receiveShadow).toBe(true)

      const material = grassMesh!.material as THREE.MeshStandardMaterial
      expect(material.vertexColors).toBe(true)
      expect(material.side).toBe(THREE.DoubleSide)
      expect(material.userData.grassTime).toBeDefined()

      // Verify wind animation advances grassTime uniform
      const initialTime = material.userData.grassTime.value
      vi.mocked(requestAnimationFrame).mock.calls.at(-1)?.[0](2500)
      expect(material.userData.grassTime.value).toBeGreaterThan(initialTime)

      handle.dispose()
    })
  })

  describe('Phase 5: Rocks and cliffs', () => {
    it('generates ready 3D rock geometry for 4 variants with correct vertex and index counts', () => {
      const variant0 = createRockGeometry(0)
      const variant1 = createRockGeometry(1)
      const variant2 = createRockGeometry(2)
      const variant3 = createRockGeometry(3)

      expect(variant0).toBeInstanceOf(THREE.BufferGeometry)
      expect(variant1).toBeInstanceOf(THREE.BufferGeometry)
      expect(variant2).toBeInstanceOf(THREE.BufferGeometry)
      expect(variant3).toBeInstanceOf(THREE.BufferGeometry)

      expect(variant0.getAttribute('position').count).toBe(142)
      expect(variant0.getIndex()!.count).toBe(210)

      expect(variant1.getAttribute('position').count).toBe(164)
      expect(variant1.getIndex()!.count).toBe(240)

      expect(variant2.getAttribute('position').count).toBe(154)
      expect(variant2.getIndex()!.count).toBe(216)

      expect(variant3.getAttribute('position').count).toBe(268)
      expect(variant3.getIndex()!.count).toBe(384)

      variant0.dispose()
      variant1.dispose()
      variant2.dispose()
      variant3.dispose()
    })

    it('places rocks on both steep slopes (>20°) and shoreline (height <= 1.45m)', () => {
      const terrain = terrainModule.createIslandTerrain(41723)
      const placements = createRockPlacements(terrain)

      expect(placements.length).toBeGreaterThan(50)
      const slopeRocks = placements.filter(([x, z]) => terrainModule.sampleTerrainSlope(terrain, x, z) >= 20.0)
      const shoreRocks = placements.filter(([x, z]) => {
        const h = terrainModule.sampleIslandTerrain(terrain, x, z).height
        return h >= 0.95 && h <= 1.45
      })

      expect(slopeRocks.length).toBeGreaterThan(20)
      expect(shoreRocks.length).toBeGreaterThan(15)
      expect(placements.every(([x, z]) => terrainModule.sampleIslandTerrain(terrain, x, z).height > 0.9)).toBe(true)
    })

    it('populates InstancedMesh rock variants in the scene on steep slopes and shore', async () => {
      const handle = await createIslandScene(makeContainer(840, 540), vi.fn())
      const scene = rendererState.renderArgs[0][0] as THREE.Scene

      // Find rock InstancedMeshes
      const instancedMeshes = scene.children.filter((child): child is THREE.InstancedMesh =>
        child instanceof THREE.InstancedMesh && child.count > 0,
      )
      // Filter out grass mesh (which has 408 vertices and vertex colors)
      const rockMeshes = instancedMeshes.filter(
        (mesh) => mesh.geometry.getAttribute('position').count !== 408,
      )

      expect(rockMeshes.length).toBeGreaterThanOrEqual(2)
      const totalRockInstances = rockMeshes.reduce((sum, mesh) => sum + mesh.count, 0)
      expect(totalRockInstances).toBeGreaterThan(50)

      // Verify materials and shadow settings
      for (const mesh of rockMeshes) {
        expect(mesh.receiveShadow).toBe(true)
        expect(mesh.castShadow).toBe(true)
        const mat = mesh.material as THREE.MeshStandardMaterial
        expect(mat.roughness).toBeGreaterThanOrEqual(0.7)
      }

      handle.dispose()
    })
  })

  describe('Phase 6: Trees and vegetation', () => {
    it('generates ready 3D tree geometries with distinct vertex colors for bark and foliage', () => {
      const pine = createTreeGeometry('pine')
      const deciduous = createTreeGeometry('deciduous')
      const palm = createTreeGeometry('palm')

      expect(pine).toBeInstanceOf(THREE.BufferGeometry)
      expect(deciduous).toBeInstanceOf(THREE.BufferGeometry)
      expect(palm).toBeInstanceOf(THREE.BufferGeometry)

      // Vertex counts from Kenney Nature Kit CC0 models
      expect(pine.getAttribute('position').count).toBe(392)
      expect(pine.getIndex()!.count).toBe(690)

      expect(deciduous.getAttribute('position').count).toBe(192)
      expect(deciduous.getIndex()!.count).toBe(342)

      expect(palm.getAttribute('position').count).toBe(296)
      expect(palm.getIndex()!.count).toBe(558)

      // Vertex colors: bark vs foliage
      const pineColors = pine.getAttribute('color')
      expect(pineColors).toBeDefined()
      let foundBark = false
      let foundFoliage = false
      for (let i = 0; i < pineColors.count; i += 1) {
        const r = pineColors.getX(i)
        const g = pineColors.getY(i)
        if (g > r) foundFoliage = true
        if (r > g) foundBark = true
      }
      expect(foundFoliage).toBe(true)
      expect(foundBark).toBe(true)

      pine.dispose()
      deciduous.dispose()
      palm.dispose()
    })

    it('generates deterministic tree placements by biome (palms on shore, deciduous on plains, pines on mountains)', () => {
      const terrain = terrainModule.createIslandTerrain(41723)
      const forest1 = createForestPlacements(terrain)
      const forest2 = createForestPlacements(terrain)

      expect(forest1).toEqual(forest2)
      expect(forest1.palms.length).toBeGreaterThan(15)
      expect(forest1.deciduous.length).toBeGreaterThan(30)
      expect(forest1.pines.length).toBeGreaterThan(30)

      // Palms: shoreline sand (0.3 <= height <= 1.8), gentle slope (< 18°)
      for (const [x, z] of forest1.palms) {
        const sample = terrainModule.sampleIslandTerrain(terrain, x, z)
        expect(sample.land).toBe(true)
        expect(sample.height).toBeGreaterThanOrEqual(0.3)
        expect(sample.height).toBeLessThanOrEqual(1.8)
        const slope = terrainModule.sampleTerrainSlope(terrain, x, z)
        expect(slope).toBeLessThan(18.0)
      }

      // Deciduous: temperate plains and interior forest (1.8 <= height <= 8.0)
      for (const [x, z] of forest1.deciduous) {
        const sample = terrainModule.sampleIslandTerrain(terrain, x, z)
        expect(sample.land).toBe(true)
        expect(sample.height).toBeGreaterThanOrEqual(1.8)
        expect(sample.height).toBeLessThanOrEqual(8.0)
      }

      // Pines: foothills and mountain slopes (5.0 <= height <= 16.5, slope <= 30°)
      for (const [x, z] of forest1.pines) {
        const sample = terrainModule.sampleIslandTerrain(terrain, x, z)
        expect(sample.land).toBe(true)
        expect(sample.height).toBeGreaterThanOrEqual(5.0)
        expect(sample.height).toBeLessThanOrEqual(16.5)
        const slope = terrainModule.sampleTerrainSlope(terrain, x, z)
        expect(slope).toBeLessThanOrEqual(30.0)
      }

      // No trees on bare snowy mountain summits (> 17.0)
      const allPlacements = [...forest1.palms, ...forest1.deciduous, ...forest1.pines]
      expect(allPlacements.every(([x, z]) => terrainModule.sampleIslandTerrain(terrain, x, z).height <= 17.0)).toBe(true)
    })

    it('populates InstancedMesh tree variants in the scene with shadow casting and receiving', async () => {
      const handle = await createIslandScene(makeContainer(840, 540), vi.fn())
      const scene = rendererState.renderArgs[0][0] as THREE.Scene

      // Find tree instanced meshes
      const instancedMeshes = scene.children.filter((child): child is THREE.InstancedMesh =>
        child instanceof THREE.InstancedMesh && child.count > 0,
      )

      // Tree meshes have vertex counts 392 (pine), 192 (deciduous), 296 (palm)
      const treeMeshes = instancedMeshes.filter((mesh) => {
        const vertexCount = mesh.geometry.getAttribute('position')?.count
        return vertexCount === 392 || vertexCount === 192 || vertexCount === 296
      })

      expect(treeMeshes.length).toBe(3)
      for (const mesh of treeMeshes) {
        expect(mesh.castShadow).toBe(true)
        expect(mesh.receiveShadow).toBe(true)
        const mat = mesh.material as THREE.MeshStandardMaterial
        expect(mat.vertexColors).toBe(true)
        expect(mat.roughness).toBeGreaterThanOrEqual(0.6)
      }

      const totalTreeCount = treeMeshes.reduce((sum, mesh) => sum + mesh.count, 0)
      expect(totalTreeCount).toBeGreaterThan(100)

      handle.dispose()
    })
  })
})

