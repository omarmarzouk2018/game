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
  const controller = createCameraController({
    camera,
    element,
    islandCenter: new THREE.Vector3(),
    movementBounds: new THREE.Box2(new THREE.Vector2(-10, -8), new THREE.Vector2(10, 8)),
    minDistance: 8,
    maxDistance: 40,
  })
  controllers.push(controller)
  return { camera, element, controller }
}

afterEach(() => {
  controllers.splice(0).forEach(({ dispose }) => dispose())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('createCameraController', () => {
  it('moves across the island at a responsive keyboard pace', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const camera = new THREE.PerspectiveCamera(42, 1.5, 0.1, 600)
    camera.position.set(0, 12, -16)
    camera.lookAt(0, 0, 0)
    const controller = createCameraController({
      camera,
      element,
      islandCenter: new THREE.Vector3(),
      movementBounds: new THREE.Box2(new THREE.Vector2(-100, -100), new THREE.Vector2(100, 100)),
      minDistance: 8,
      maxDistance: 40,
    })
    controllers.push(controller)
    const before = camera.position.clone()

    key('keydown', 'ArrowUp')
    controller.update(0.5)

    expect(camera.position.distanceTo(before)).toBeGreaterThan(20)
  })

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

  it('pans the map while dragging with the left mouse button', () => {
    const { camera, element, controller } = setup()
    const before = camera.position.clone()
    element.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, bubbles: true }))
    element.dispatchEvent(new PointerEvent('pointermove', { buttons: 1, clientX: 90, clientY: 50, bubbles: true }))
    controller.update(1)

    expect(camera.position.distanceTo(before)).toBeGreaterThan(0)
  })

  it('shows grab cursors while hovering and dragging', () => {
    const { element } = setup()
    expect(element.style.cursor).toBe('grab')
    element.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }))
    expect(element.style.cursor).toBe('grabbing')
    element.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }))
    expect(element.style.cursor).toBe('grab')
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

  it('zooms in past the full-island framing distance and backs out beyond it', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const fitDistance = 320
    const islandCenter = new THREE.Vector3(0, 0.35, 0)
    const camera = new THREE.PerspectiveCamera(42, 1.5, 0.1, 1200)
    camera.userData.islandFitDistance = fitDistance
    camera.position.set(0, 0.35 + fitDistance, 0)
    const controller = createCameraController({
      camera,
      element,
      islandCenter,
      movementBounds: new THREE.Box2(new THREE.Vector2(-10, -8), new THREE.Vector2(10, 8)),
      minDistance: 54,
      maxDistance: 700,
    })
    controllers.push(controller)
    const startDistance = camera.position.distanceTo(islandCenter)

    element.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000, cancelable: true }))
    controller.update(1)
    const zoomedInDistance = camera.position.distanceTo(islandCenter)
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: 1000, cancelable: true }))
    controller.update(1)

    expect(zoomedInDistance).toBeLessThan(startDistance / 2)
    expect(camera.position.distanceTo(islandCenter)).toBeGreaterThan(startDistance)
  })

  it('synchronizes zoom state when the viewport requires a wider fit', () => {
    const { camera, controller } = setup()
    camera.userData.islandFitDistance = 320
    controller.setDistance(320)
    controller.update(1)
    expect(camera.position.length()).toBeCloseTo(320)
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

  it('rotates at half the previous pointer sensitivity', () => {
    const { camera, element, controller } = setup()
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, bubbles: true }))
    key('keydown', 'Control')
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, bubbles: true }))
    controller.update(1)

    const azimuth = Math.atan2(camera.position.x, camera.position.z)
    const rotation = Math.abs(Math.atan2(Math.sin(azimuth - Math.PI), Math.cos(azimuth - Math.PI)))
    expect(rotation).toBeCloseTo(0.6, 2)
  })

  it('keeps the freely chosen azimuth unchanged after Ctrl is released', () => {
    const { camera, element, controller } = setup()
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true }))
    key('keydown', 'Control')
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 112, clientY: 0, bubbles: true }))
    controller.update(1)
    key('keyup', 'Control')
    const freelyChosenPosition = camera.position.clone()
    controller.update(5)
    expect(camera.position.x).toBeCloseTo(freelyChosenPosition.x, 4)
    expect(camera.position.z).toBeCloseTo(freelyChosenPosition.z, 4)
  })

  it('stops rotation when the window loses focus while Ctrl is held', () => {
    const { camera, element, controller } = setup()
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true }))
    key('keydown', 'Control')
    window.dispatchEvent(new Event('blur'))
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 0, bubbles: true }))
    controller.update(1)

    expect(camera.position.x).toBeCloseTo(0)
  })

  it('reverses camera pitch direction when the pointer moves upward with Ctrl', () => {
    const { camera, element, controller } = setup()
    const initialY = camera.position.y
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true }))
    key('keydown', 'Control')
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: -80, bubbles: true }))
    controller.update(1)
    expect(camera.position.y).toBeLessThan(initialY)
  })

  it('eases camera rotation toward the pointer-selected direction', () => {
    const { camera, element, controller } = setup()
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true }))
    key('keydown', 'Control')
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 0, bubbles: true }))
    const initialPosition = camera.position.clone()

    controller.update(0.05)
    const easedPosition = camera.position.clone()
    controller.update(1)

    expect(easedPosition.distanceTo(initialPosition)).toBeGreaterThan(0)
    expect(easedPosition.distanceTo(initialPosition)).toBeLessThan(camera.position.distanceTo(initialPosition))
  })

  it('clamps camera pitch to prevent near-vertical and inverted views', () => {
    const { camera, element, controller } = setup()
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true }))
    key('keydown', 'Control')
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: -100000, bubbles: true }))
    controller.update(1)
    const nearlyTopDownAngle = camera.getWorldDirection(new THREE.Vector3()).angleTo(new THREE.Vector3(0, -1, 0))
    expect(nearlyTopDownAngle).toBeGreaterThan(0.1)
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 100000, bubbles: true }))
    controller.update(1)
    const shallowAngle = camera.getWorldDirection(new THREE.Vector3()).angleTo(new THREE.Vector3(0, -1, 0))
    expect(shallowAngle).toBeLessThan(Math.PI / 2)
    expect(shallowAngle).toBeGreaterThan(0)
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
