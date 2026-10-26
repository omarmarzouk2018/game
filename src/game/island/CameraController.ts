import * as THREE from 'three'

export type CameraControllerOptions = {
  camera: THREE.PerspectiveCamera
  element: HTMLElement
  islandCenter: THREE.Vector3
  movementBounds: THREE.Box2
  minDistance: number
  maxDistance: number
}

const movementSpeed = 42
const wheelZoomFactor = 0.003
const pointerRotationFactor = 0.012
const rotationRate = 24
const zoomRate = 16
const minPolarAngle = 0.12
const maxPolarAngle = Math.PI / 2 - 0.08

function isTextEntryFocused(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  return active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)
}

export function createCameraController(options: CameraControllerOptions): {
  update(deltaSeconds: number): void
  setDistance(distance: number): void
  dispose(): void
} {
  const { camera, element, islandCenter, movementBounds, minDistance, maxDistance } = options
  const target = islandCenter.clone()
  const offset = camera.position.clone().sub(target)
  const getMinimumDistance = () => Math.max(1, minDistance)
  const getMaximumDistance = () => Math.max(maxDistance, Number(camera.userData.islandFitDistance) || 0, getMinimumDistance())
  let distance = THREE.MathUtils.clamp(offset.length(), getMinimumDistance(), getMaximumDistance())
  let desiredDistance = distance
  let polarAngle = THREE.MathUtils.clamp(
    Math.acos(THREE.MathUtils.clamp(offset.y / Math.max(offset.length(), 1e-6), -1, 1)),
    minPolarAngle,
    maxPolarAngle,
  )
  let desiredPolarAngle = polarAngle
  let azimuth = Math.atan2(offset.x, offset.z)
  let desiredAzimuth = azimuth
  let controlPressed = false
  let pointerX: number | undefined
  let pointerY: number | undefined
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
      pointerX = undefined
      pointerY = undefined
      return
    }
    pressedKeys.delete(event.key)
  }

  const onWindowBlur = () => {
    controlPressed = false
    pointerX = undefined
    pointerY = undefined
  }

  const onPointerMove = (event: PointerEvent) => {
    if (isTextEntryFocused()) return
    if (!controlPressed) {
      pointerX = event.clientX
      pointerY = event.clientY
      return
    }
    if (pointerX !== undefined) desiredAzimuth -= (event.clientX - pointerX) * pointerRotationFactor
    if (pointerY !== undefined) desiredPolarAngle = THREE.MathUtils.clamp(
      desiredPolarAngle - (event.clientY - pointerY) * pointerRotationFactor,
      minPolarAngle,
      maxPolarAngle,
    )
    pointerX = event.clientX
    pointerY = event.clientY
  }

  const onWheel = (event: WheelEvent) => {
    if (isTextEntryFocused()) return
    event.preventDefault()
    desiredDistance = THREE.MathUtils.clamp(
      desiredDistance * Math.exp(event.deltaY * wheelZoomFactor),
      getMinimumDistance(),
      getMaximumDistance(),
    )
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  element.addEventListener('pointermove', onPointerMove)
  element.addEventListener('wheel', onWheel, { passive: false })

  return {
    setDistance(nextDistance: number) {
      distance = THREE.MathUtils.clamp(nextDistance, getMinimumDistance(), getMaximumDistance())
      desiredDistance = distance
      placeCamera()
    },
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
      const rotationBlend = 1 - Math.exp(-rotationRate * delta)
      distance += (desiredDistance - distance) * zoomBlend
      azimuth += Math.atan2(Math.sin(desiredAzimuth - azimuth), Math.cos(desiredAzimuth - azimuth)) * rotationBlend
      polarAngle += (desiredPolarAngle - polarAngle) * rotationBlend
      placeCamera()
    },
    dispose() {
      if (disposed) return
      disposed = true
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('wheel', onWheel)
      pressedKeys.clear()
    },
  }
}
