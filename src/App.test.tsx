import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sceneState = vi.hoisted(() => ({
  create: vi.fn(),
  handles: [] as Array<{ resize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}))

vi.mock('./game/island/IslandScene', () => ({
  createIslandScene: (...args: unknown[]) => sceneState.create(...args),
}))

import App from './App'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

class TestResizeObserver {
  static instances: TestResizeObserver[] = []
  callback: ResizeObserverCallback
  observe = vi.fn()
  disconnect = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    TestResizeObserver.instances.push(this)
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

beforeEach(() => {
  sceneState.create.mockReset()
  sceneState.handles = []
  TestResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App island scene lifecycle', () => {
  it('shows accessible loading feedback until scene initialization resolves', async () => {
    const pending = deferred<{ resize: () => void; dispose: () => void }>()
    sceneState.create.mockReturnValue(pending.promise)

    render(<App />)

    expect(screen.getByTestId('scene-host')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/تحميل/)
    expect(sceneState.create).toHaveBeenCalledOnce()
    await act(async () => pending.resolve({ resize: vi.fn(), dispose: vi.fn() }))
  })

  it('shows active rotation feedback only while Ctrl is held', async () => {
    sceneState.create.mockResolvedValue({ resize: vi.fn(), dispose: vi.fn() })
    render(<App />)
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'Control' })
    expect(screen.getByText('الدوران نشط · حرّك المؤشر')).toBeInTheDocument()

    fireEvent.keyUp(window, { key: 'Control' })
    expect(screen.queryByText('الدوران نشط · حرّك المؤشر')).not.toBeInTheDocument()
  })

  it('shows the canvas region and Arabic control hints after successful initialization', async () => {
    const handle = { resize: vi.fn(), dispose: vi.fn() }
    sceneState.create.mockImplementation(async (container: HTMLElement) => {
      container.append(document.createElement('canvas'))
      return handle
    })
    const { container } = render(<App />)

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(container.querySelector('.scene-host canvas')).toBeInTheDocument()
    expect(screen.getByText(/الأسهم/)).toBeInTheDocument()
    expect(screen.getByText(/عجلة الفأرة/)).toBeInTheDocument()
    expect(screen.getByText(/Ctrl/)).toBeInTheDocument()
    expect(screen.getByText('الجزيرة غير مأهولة')).toBeInTheDocument()
  })

  it('shows live frame-rate readings from the scene and resets on a scene restart', async () => {
    const handle = { resize: vi.fn(), dispose: vi.fn() }
    sceneState.create.mockResolvedValue(handle)
    render(<App />)
    await waitFor(() => expect(sceneState.create).toHaveBeenCalledOnce())
    const options = sceneState.create.mock.calls[0][2] as { onFrameRateUpdate: (reading: { state: 'active' | 'paused'; fps: number | null; frameTimeMs: number | null }) => void }

    act(() => options.onFrameRateUpdate({ state: 'active', fps: 60, frameTimeMs: 16.7 }))
    expect(screen.getByLabelText('أداء العرض')).toHaveTextContent('60 FPS · 16.7 مللي ثانية')

    act(() => options.onFrameRateUpdate({ state: 'paused', fps: null, frameTimeMs: null }))
    expect(screen.getByLabelText('أداء العرض')).toHaveTextContent('العرض متوقف')
  })

  it('shows an Arabic fatal error and retry action when initialization rejects', async () => {
    sceneState.create.mockRejectedValueOnce(new Error('failure'))
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/تعذّر تحميل مشهد الجزيرة/)
    expect(screen.getByRole('button', { name: /إعادة المحاولة/ })).toBeInTheDocument()
  })

  it('reinitializes the scene when retry is selected', async () => {
    const failed = deferred<{ resize: () => void; dispose: () => void }>()
    const handle = { resize: vi.fn(), dispose: vi.fn() }
    sceneState.create.mockReturnValueOnce(failed.promise).mockResolvedValueOnce(handle)
    render(<App />)
    await act(async () => failed.reject(new Error('failure')))

    fireEvent.click(await screen.findByRole('button', { name: /إعادة المحاولة/ }))

    await waitFor(() => expect(sceneState.create).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('disposes the scene on unmount and disconnects its resize observer', async () => {
    const handle = { resize: vi.fn(), dispose: vi.fn() }
    sceneState.create.mockResolvedValue(handle)
    const { unmount } = render(<App />)
    await waitFor(() => expect(sceneState.create).toHaveBeenCalledOnce())
    await waitFor(() => expect(TestResizeObserver.instances[0]?.observe).toHaveBeenCalled())

    unmount()

    expect(handle.dispose).toHaveBeenCalledOnce()
    expect(TestResizeObserver.instances[0].disconnect).toHaveBeenCalledOnce()
  })

  it('disposes a scene that resolves after unmount without changing state', async () => {
    const pending = deferred<{ resize: () => void; dispose: () => void }>()
    const handle = { resize: vi.fn(), dispose: vi.fn() }
    sceneState.create.mockReturnValue(pending.promise)
    const { unmount } = render(<App />)
    unmount()

    await act(async () => pending.resolve(handle))

    expect(handle.dispose).toHaveBeenCalledOnce()
  })

  it('resizes the existing scene through ResizeObserver', async () => {
    const handle = { resize: vi.fn(), dispose: vi.fn() }
    sceneState.create.mockResolvedValue(handle)
    render(<App />)
    await waitFor(() => expect(TestResizeObserver.instances[0]?.observe).toHaveBeenCalled())

    act(() => TestResizeObserver.instances[0].trigger())

    expect(handle.resize).toHaveBeenCalledOnce()
    expect(sceneState.create).toHaveBeenCalledOnce()
  })

  it('uses and removes the window resize fallback when ResizeObserver is unavailable', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const handle = { resize: vi.fn(), dispose: vi.fn() }
    sceneState.create.mockResolvedValue(handle)
    const addListener = vi.spyOn(window, 'addEventListener')
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<App />)

    await waitFor(() => expect(addListener).toHaveBeenCalledWith('resize', handle.resize))
    act(() => window.dispatchEvent(new Event('resize')))
    expect(handle.resize).toHaveBeenCalledOnce()

    unmount()

    expect(removeListener).toHaveBeenCalledWith('resize', handle.resize)
  })
})
