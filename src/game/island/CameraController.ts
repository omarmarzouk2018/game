import * as THREE from 'three'

export type CameraControllerOptions = {
  camera: THREE.PerspectiveCamera
  element: HTMLElement
  islandCenter: THREE.Vector3
  movementBounds: THREE.Box2
  minDistance: number
  maxDistance: number
  onRenderRequested: () => void
}

const movementSpeed = 28
const wheelZoomFactor = 0.0015
const pointerRotationFactor = 0.006
const snapRate = 12
const zoomRate = 10

function isTextEntryFocused(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  return active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)
}

export function createCameraController(options: CameraControllerOptions): {
  update(deltaSeconds: number): void
  dispose(): void
} {
  const { camera, element, islandCenter, movementBounds, minDistance, maxDistance, onRenderRequested } = options
  const target = islandCenter.clone()
  const offset = camera.position.clone().sub(target)
  const getMinimumDistance = () => Math.max(minDistance, Number(camera.userData.islandFitDistance) || 0)
  const getMaximumDistance = () => Math.max(maxDistance, getMinimumDistance())
  let distance = THREE.MathUtils.clamp(offset.length(), getMinimumDistance(), getMaximumDistance())
  let desiredDistance = distance
  const polarAngle = Math.acos(THREE.MathUtils.clamp(offset.y / Math.max(offset.length(), 1e-6), -1, 1))
  let azimuth = Math.atan2(offset.x, offset.z)
  let snapTarget: number | undefined
  let controlPressed = false
  let pointerX: number | undefined
  const pressedKeys = new Set<string>()
  let disposed = false

  const placeCamera = () => {
    const horizontalDistance = Math.sin(polarAngle) * distance
    camera.userData.islandCameraTarget = target.clone()
    camera.position.set(
      target.x + Math.sin(azimuth) * horizontalDistance,
      target.y + Math.cos(polarAngle) * distance,
      target.z + Math.cos(azimuth) * horizontalDistance,
    )
    camera.lookAt(target)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTextEntryFocused()) return
    if (event.key === 'Control') {
      controlPressed = true
      snapTarget = undefined
      return
    }
    if (event.key.startsWith('Arrow')) {
      pressedKeys.add(event.key)
      event.preventDefault()
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Control' && controlPressed) {
      controlPressed = false
      if (!isTextEntryFocused()) {
        const quarterTurn = Math.PI / 2
        snapTarget = Math.round(azimuth / quarterTurn) * quarterTurn
      } else {
        snapTarget = undefined
      }
      pointerX = undefined
      return
    }
    pressedKeys.delete(event.key)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (isTextEntryFocused()) return
    if (!controlPressed) {
      pointerX = event.clientX
      return
    }
    if (pointerX !== undefined) azimuth -= (event.clientX - pointerX) * pointerRotationFactor
    pointerX = event.clientX
    snapTarget = undefined
    placeCamera()
    onRenderRequested()
  }

  const onWheel = (event: WheelEvent) => {
    if (isTextEntryFocused()) return
    event.preventDefault()
    desiredDistance = THREE.MathUtils.clamp(
      desiredDistance * Math.exp(event.deltaY * wheelZoomFactor),
      getMinimumDistance(),
      getMaximumDistance(),
    )
    onRenderRequested()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  element.addEventListener('pointermove', onPointerMove)
  element.addEventListener('wheel', onWheel, { passive: false })

  return {
    update(deltaSeconds: number) {
      if (disposed) return
      const delta = Math.max(0, deltaSeconds)
      distance = THREE.MathUtils.clamp(distance, getMinimumDistance(), getMaximumDistance())
      desiredDistance = THREE.MathUtils.clamp(desiredDistance, getMinimumDistance(), getMaximumDistance())
      if (!isTextEntryFocused()) {
        const forward = new THREE.Vector3(-Math.sin(azimuth), 0, -Math.cos(azimuth))
        const right = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth))
        const movement = new THREE.Vector3()
        if (pressedKeys.has('ArrowUp')) movement.add(forward)
        if (pressedKeys.has('ArrowDown')) movement.sub(forward)
        if (pressedKeys.has('ArrowRight')) movement.add(right)
        if (pressedKeys.has('ArrowLeft')) movement.sub(right)
        if (movement.lengthSq() > 0) {
          movement.normalize().multiplyScalar(movementSpeed * delta)
          target.add(movement)
          target.x = THREE.MathUtils.clamp(target.x, movementBounds.min.x, movementBounds.max.x)
          target.z = THREE.MathUtils.clamp(target.z, movementBounds.min.y, movementBounds.max.y)
        }
      }
      const zoomBlend = 1 - Math.exp(-zoomRate * delta)
      distance += (desiredDistance - distance) * zoomBlend
      if (snapTarget !== undefined) {
        const angularDifference = Math.atan2(Math.sin(snapTarget - azimuth), Math.cos(snapTarget - azimuth))
        azimuth += angularDifference * (1 - Math.exp(-snapRate * delta))
        if (Math.abs(angularDifference) < 0.001) {
          azimuth = snapTarget
          snapTarget = undefined
        }
      }
      placeCamera()
    },
    dispose() {
      if (disposed) return
      disposed = true
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('wheel', onWheel)
      pressedKeys.clear()
    },
  }
}
