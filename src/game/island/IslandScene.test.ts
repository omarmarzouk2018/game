import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rendererState = vi.hoisted(() => ({
  instances: [] as Array<{ domElement: HTMLCanvasElement; setSize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; setPixelRatio: ReturnType<typeof vi.fn>; shadowMap: { enabled: boolean; type: number } }>,
  failConstruction: false,
  loadFails: new Set<string>(),
  loadedUrls: [] as string[],
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
    shadowMap = { enabled: false, type: 0 }
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
      return { scene: new Group() }
    }
  },
}))

import { createIslandScene } from './IslandScene'
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
  rendererState.loadedUrls.length = 0
  rendererState.renderArgs.length = 0
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('createIslandScene lifecycle', () => {
  it('appends a canvas and sizes the renderer from the active container', async () => {
    const container = makeContainer(840, 540)
    const handle = await createIslandScene(container, vi.fn())
    expect(container.querySelector('canvas')).not.toBeNull()
    expect(rendererState.loadedUrls.some((url) => url.includes('mature-scots-pine.glb'))).toBe(true)
    expect(rendererState.loadedUrls.some((url) => url.startsWith('blob:'))).toBe(true)
    expect(rendererState.instances[0].setSize).toHaveBeenCalledWith(840, 540, false)
    handle.dispose()
  })

  it('resizes from the active container when the window changes size', async () => {
    const container = makeContainer(800, 600)
    const handle = await createIslandScene(container, vi.fn())
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 1024 })
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 768 })
    window.dispatchEvent(new Event('resize'))
    expect(rendererState.instances[0].setSize).toHaveBeenLastCalledWith(1024, 768, false)
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
