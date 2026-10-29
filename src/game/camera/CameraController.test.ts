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

  it('pans the map opposite the vertical drag direction', () => {
    const { camera, element, controller } = setup()
    const initialCameraZ = camera.position.z
    element.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 20, clientY: 100, bubbles: true }))
    element.dispatchEvent(new PointerEvent('pointermove', { buttons: 1, clientX: 20, clientY: 0, bubbles: true }))
    controller.update(1)

    expect(camera.position.z).toBeLessThan(initialCameraZ)
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

  it('zooms towards the cursor position on the ground plane when zooming in', () => {
    const { camera, element, controller } = setup()
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // Cursor is to the right of the center (center is 400, 300)
    element.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -300,
      clientX: 600,
      clientY: 300,
      cancelable: true,
    }))

    controller.update(1)

    // Camera target and position x should have shifted towards negative X (where cursor was pointing on the right side from North looking South)
    const target = camera.userData.islandCameraTarget as THREE.Vector3
    expect(target).toBeDefined()
    expect(target.x).toBeLessThan(-0.5)
    expect(camera.position.x).toBeLessThan(-0.5)
  })

  it('zooms away from the cursor position when zooming out', () => {
    const { camera, element, controller } = setup()
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // Cursor is to the right of the center
    element.dispatchEvent(new WheelEvent('wheel', {
      deltaY: 300,
      clientX: 600,
      clientY: 300,
      cancelable: true,
    }))

    controller.update(1)

    // Camera target should shift away from cursor
    const target = camera.userData.islandCameraTarget as THREE.Vector3
    expect(target).toBeDefined()
    expect(target.x).toBeGreaterThan(0.5)
  })

  it('clears cursor zoom anchor when manual arrow panning starts', () => {
    const { camera, element, controller } = setup()
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    element.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -300,
      clientX: 600,
      clientY: 300,
      cancelable: true,
    }))

    // Press arrow key to cancel anchor
    key('keydown', 'ArrowLeft')
    controller.update(0.5)
    key('keyup', 'ArrowLeft')

    const target = camera.userData.islandCameraTarget as THREE.Vector3
    expect(target).toBeDefined()
  })

  it('safely handles cursor pointing above the horizon without moving target unexpectedly', () => {
    const { camera, element, controller } = setup()
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // Pointing high above the horizon (clientY = -500, sky direction)
    element.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -200,
      clientX: 400,
      clientY: -500,
      cancelable: true,
    }))

    controller.update(1)

    // Normal zoom still works without errors and target remains centered
    const target = camera.userData.islandCameraTarget as THREE.Vector3
    expect(target.x).toBeCloseTo(0)
  })

  it('pans the map using middle mouse button (button 1)', () => {
    const { camera, element, controller } = setup()
    const before = camera.position.clone()
    element.dispatchEvent(new PointerEvent('pointerdown', { button: 1, clientX: 20, clientY: 20, bubbles: true }))
    element.dispatchEvent(new PointerEvent('pointermove', { buttons: 4, clientX: 100, clientY: 60, bubbles: true }))
    controller.update(1)

    expect(camera.position.distanceTo(before)).toBeGreaterThan(0)
  })

  it('pans the map using right mouse button (button 2)', () => {
    const { camera, element, controller } = setup()
    const before = camera.position.clone()
    element.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX: 30, clientY: 30, bubbles: true }))
    element.dispatchEvent(new PointerEvent('pointermove', { buttons: 2, clientX: 120, clientY: 80, bubbles: true }))
    controller.update(1)

    expect(camera.position.distanceTo(before)).toBeGreaterThan(0)
  })

  it('pans the map using WASD keys', () => {
    const { camera, controller } = setup()
    const initialZ = camera.position.z

    key('keydown', 'w')
    controller.update(0.5)
    key('keyup', 'w')
    expect(camera.position.z).toBeGreaterThan(initialZ)

    const beforeD = camera.position.clone()
    key('keydown', 'd')
    controller.update(0.5)
    key('keyup', 'd')
    expect(camera.position.distanceTo(beforeD)).toBeGreaterThan(0)
    expect(camera.position.x).not.toBeCloseTo(beforeD.x)
  })

  it('rotates the camera using Q and E keys', () => {
    const { camera, controller } = setup()
    const initialX = camera.position.x

    key('keydown', 'q')
    controller.update(0.5)
    key('keyup', 'q')
    expect(camera.position.x).not.toBeCloseTo(initialX)
  })

  it('rotates with Ctrl + mouse move even when isInteractionActive is true', () => {
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
      isInteractionActive: () => true,
    })
    controllers.push(controller)

    const before = camera.position.clone()
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, bubbles: true }))
    key('keydown', 'Control')
    element.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, bubbles: true }))
    controller.update(1)

    expect(camera.position.x).not.toBeCloseTo(before.x)
  })

  it('pans with Space + Left click drag even when isInteractionActive is true', () => {
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
      isInteractionActive: () => true,
    })
    controllers.push(controller)

    const before = camera.position.clone()
    key('keydown', ' ')
    element.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, bubbles: true }))
    element.dispatchEvent(new PointerEvent('pointermove', { buttons: 1, clientX: 90, clientY: 50, bubbles: true }))
    controller.update(1)

    expect(camera.position.distanceTo(before)).toBeGreaterThan(0)
  })

  it('pans camera directly using pan and panRelative methods', () => {
    const { camera, controller } = setup()
    const before = camera.position.clone()

    controller.pan(5, 5)
    expect(camera.position.x).not.toBeCloseTo(before.x)

    const mid = camera.position.clone()
    controller.panRelative(5, 5)
    expect(camera.position.distanceTo(mid)).toBeGreaterThan(0)
  })
})
