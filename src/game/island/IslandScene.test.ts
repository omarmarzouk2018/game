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
import { createIslandScene, createRockPlacements, createTerrainGeometry, rewriteRockDocument } from './IslandScene'
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
      expect(position.getY(i)).toBeGreaterThanOrEqual(-1.05)
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
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(-1.5)
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
    const maximumHeight = Math.max(...terrain.heights)
    const initialFitDistance = Math.hypot(terrain.width / 2, maximumHeight - 0.35, terrain.depth / 2) / Math.sin(THREE.MathUtils.degToRad(21))
    const initialCameraOffset = camera.position.clone().sub(new THREE.Vector3(0, 0.35, 0))
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
    const narrowFitDistance = Math.hypot(terrain.width / 2, maximumHeight - 0.35, terrain.depth / 2) / Math.sin(horizontalHalfFov)
    expect(camera.position.distanceTo(new THREE.Vector3(0, 0.35, 0))).toBeGreaterThanOrEqual(narrowFitDistance - 0.01)
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
})
