import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCameraController } from './CameraController'

const controllers: Array<{ dispose(): void }> = []
const key = (type: 'keydown' | 'keyup', value: string, target: EventTarget = window) => {
  const event = new KeyboardEvent(type, { key: value, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function setup() {
  const element = document.createElement('div')
  document.body.append(element)
  const camera = new THREE.PerspectiveCamera(42, 1.5, 0.1, 600)
  camera.position.set(0, 12, -16)
  camera.lookAt(0, 0, 0)
  const onRenderRequested = vi.fn()
  const controller = createCameraController({
    camera,
    element,
    islandCenter: new THREE.Vector3(),
    movementBounds: new THREE.Box2(new THREE.Vector2(-10, -8), new THREE.Vector2(10, 8)),
    minDistance: 8,
    maxDistance: 40,
    onRenderRequested,
  })
  controllers.push(controller)
  return { camera, element, controller, onRenderRequested }
}

afterEach(() => {
  controllers.splice(0).forEach(({ dispose }) => dispose())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('createCameraController', () => {
  it('moves forward along the camera-relative ground plane', () => {
    const { camera, controller } = setup()
    key('keydown', 'ArrowUp')
    controller.update(1)
    expect(camera.position.z).toBeGreaterThan(-16)
    expect(camera.position.x).toBeCloseTo(0)
  })

  it('moves right along the camera-relative ground plane after rotation', () => {
    const { camera, element, controller } = setup()
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, bubbles: true }))
    key('keydown', 'Control')
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, bubbles: true }))
    key('keyup', 'Control')
    controller.update(1)
    const before = camera.position.clone()
    key('keydown', 'ArrowRight')
    controller.update(1)
    expect(camera.position.distanceTo(before)).toBeGreaterThan(0)
    expect(camera.position.x).not.toBeCloseTo(before.x)
  })

  it('cancels opposing movement keys', () => {
    const { camera, controller } = setup()
    const before = camera.position.clone()
    key('keydown', 'ArrowUp')
    key('keydown', 'ArrowDown')
    controller.update(1)
    expect(camera.position.distanceTo(before)).toBeCloseTo(0)
  })

  it('clamps the camera target to movement bounds', () => {
    const { camera, controller } = setup()
    for (let i = 0; i < 20; i += 1) {
      key('keydown', 'ArrowRight')
      controller.update(1)
    }
    const target = new THREE.Vector3()
    camera.getWorldDirection(target)
    const cameraTarget = camera.position.clone().addScaledVector(target, camera.position.distanceTo(new THREE.Vector3(0, 0, 0)))
    expect(cameraTarget.x).toBeLessThanOrEqual(10)
    expect(cameraTarget.x).toBeGreaterThanOrEqual(-10)
  })

  it('zooms with the wheel and clamps distance', () => {
    const { camera, element, controller } = setup()
    const initialDistance = camera.position.length()
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000, cancelable: true }))
    controller.update(1)
    expect(camera.position.length()).toBeLessThan(initialDistance)
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: 100000, cancelable: true }))
    controller.update(10)
    expect(camera.position.length()).toBeLessThanOrEqual(40)
    expect(camera.position.length()).toBeGreaterThanOrEqual(8)
  })

  it('rotates on Ctrl-pointer movement without a pressed mouse button', () => {
    const { camera, element, controller } = setup()
    const before = camera.position.clone()
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, bubbles: true }))
    key('keydown', 'Control')
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, buttons: 0, bubbles: true }))
    controller.update(1)
    expect(camera.position.x).not.toBeCloseTo(before.x)
  })

  it('smoothly snaps to the nearest quarter-turn when Ctrl is released', () => {
    const { camera, element, controller } = setup()
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, bubbles: true }))
    key('keydown', 'Control')
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 112, bubbles: true }))
    controller.update(1)
    key('keyup', 'Control')
    const beforeSnap = camera.position.clone()
    controller.update(0.05)
    expect(camera.position.distanceTo(beforeSnap)).toBeGreaterThan(0)
    controller.update(5)
    expect(camera.position.x).toBeCloseTo(0, 4)
    expect(camera.position.z).toBeLessThan(0)
  })

  it('keeps the camera tilt fixed while moving and zooming', () => {
    const { camera, element, controller } = setup()
    const tilt = camera.getWorldDirection(new THREE.Vector3()).angleTo(new THREE.Vector3(0, -1, 0))
    key('keydown', 'ArrowUp')
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }))
    controller.update(1)
    expect(camera.getWorldDirection(new THREE.Vector3()).angleTo(new THREE.Vector3(0, -1, 0))).toBeCloseTo(tilt)
  })

  it('ignores movement and rotation while a text input is focused', () => {
    const { camera, element, controller } = setup()
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    const before = camera.position.clone()
    key('keydown', 'ArrowUp', input)
    key('keydown', 'Control', input)
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, bubbles: true }))
    controller.update(1)
    expect(camera.position.distanceTo(before)).toBeCloseTo(0)
  })

  it('removes input listeners on disposal', () => {
    const { camera, controller } = setup()
    const before = camera.position.clone()
    controller.dispose()
    key('keydown', 'ArrowUp')
    controller.update(1)
    expect(camera.position.distanceTo(before)).toBeCloseTo(0)
  })
})
