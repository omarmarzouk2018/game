import * as THREE from 'three'

export type CameraControllerOptions = {
  camera: THREE.PerspectiveCamera
  element: HTMLElement
  islandCenter: THREE.Vector3
  movementBounds: THREE.Box2
  minDistance: number
  maxDistance: number
  isInteractionActive?: () => boolean
}

const movementSpeed = 42
const wheelZoomFactor = 0.003
const pointerRotationFactor = 0.006
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
  pan(dx: number, dz: number): void
  panRelative(screenX: number, screenY: number): void
  dispose(): void
} {
  const { camera, element, islandCenter, movementBounds, minDistance, maxDistance, isInteractionActive } = options
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
  let spacePressed = false
  let dragging = false
  let dragButton: number | null = null
  let pointerX: number | undefined
  let pointerY: number | undefined
  const originalCursor = element.style.cursor
  const pressedKeys = new Set<string>()
  let disposed = false
  let zoomAnchor: THREE.Vector3 | null = null

  const raycaster = new THREE.Raycaster()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const intersectionPoint = new THREE.Vector3()

  const getGroundIntersection = (clientX?: number, clientY?: number): THREE.Vector3 | null => {
    const x = clientX ?? pointerX
    const y = clientY ?? pointerY
    if (x === undefined || y === undefined) return null

    const rect = element.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null

    const ndcX = ((x - rect.left) / rect.width) * 2 - 1
    const ndcY = -(((y - rect.top) / rect.height) * 2 - 1)

    camera.updateMatrixWorld()
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)

    // Ray must be pointing downwards toward the ground plane
    if (raycaster.ray.direction.y >= -1e-4) return null

    groundPlane.constant = -target.y
    const hit = raycaster.ray.intersectPlane(groundPlane, intersectionPoint)
    if (!hit) return null

    // Guard against extreme intersections near the horizon
    const maxRadius = Math.max(
      Math.abs(movementBounds.max.x - movementBounds.min.x),
      Math.abs(movementBounds.max.y - movementBounds.min.y),
    ) * 2

    const offsetFromTarget = hit.clone().sub(target)
    if (offsetFromTarget.length() > maxRadius) {
      offsetFromTarget.clampLength(0, maxRadius)
      hit.copy(target).add(offsetFromTarget)
    }

    return hit.clone()
  }

  element.style.cursor = 'grab'

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

  function isNavKey(key: string, code?: string): boolean {
    if (key.startsWith('Arrow')) return true
    const lower = key.toLowerCase()
    return (
      lower === 'w' ||
      lower === 'a' ||
      lower === 's' ||
      lower === 'd' ||
      lower === 'q' ||
      lower === 'e' ||
      code === 'KeyW' ||
      code === 'KeyA' ||
      code === 'KeyS' ||
      code === 'KeyD' ||
      code === 'KeyQ' ||
      code === 'KeyE'
    )
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTextEntryFocused()) return
    if (event.key === 'Control') {
      controlPressed = true
      return
    }
    if (event.code === 'Space' || event.key === ' ') {
      spacePressed = true
      zoomAnchor = null
      if (!dragging && isInteractionActive?.()) {
        element.style.cursor = 'grab'
      }
      return
    }
    if (isNavKey(event.key, event.code)) {
      pressedKeys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key)
      zoomAnchor = null
      if (event.key.startsWith('Arrow')) {
        event.preventDefault()
      }
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Control' && controlPressed) {
      controlPressed = false
      pointerX = undefined
      pointerY = undefined
      return
    }
    if (event.code === 'Space' || event.key === ' ') {
      spacePressed = false
      if (!dragging && isInteractionActive?.()) {
        element.style.cursor = 'crosshair'
      }
      return
    }
    pressedKeys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key)
  }

  const stopDragging = () => {
    if (!dragging) return
    dragging = false
    dragButton = null
    element.style.cursor = isInteractionActive?.() ? 'crosshair' : 'grab'
    pointerX = undefined
    pointerY = undefined
  }

  const onWindowBlur = () => {
    controlPressed = false
    spacePressed = false
    stopDragging()
    pointerX = undefined
    pointerY = undefined
  }

  const onPointerDown = (event: PointerEvent) => {
    if (isTextEntryFocused() || controlPressed) return

    // Left click (0) allowed if space is held or interaction is not active.
    // Middle click (1) and Right click (2) are always allowed to pan.
    const isLeftAllowed = event.button === 0 && (spacePressed || !isInteractionActive?.())
    const isMiddleAllowed = event.button === 1
    const isRightAllowed = event.button === 2

    if (!isLeftAllowed && !isMiddleAllowed && !isRightAllowed) return

    dragging = true
    dragButton = event.button
    zoomAnchor = null
    pointerX = event.clientX
    pointerY = event.clientY
    element.style.cursor = 'grabbing'
  }

  const onPointerUp = (event: PointerEvent) => {
    if (event.button === dragButton || (dragButton !== null && event.buttons === 0)) {
      stopDragging()
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (isTextEntryFocused()) return

    if (!controlPressed) {
      if (dragging && pointerX !== undefined && pointerY !== undefined) {
        zoomAnchor = null
        const scale = distance * 0.001
        const deltaX = event.clientX - pointerX
        const deltaY = event.clientY - pointerY
        const right = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth))
        const forward = new THREE.Vector3(-Math.sin(azimuth), 0, -Math.cos(azimuth))
        target.addScaledVector(right, -deltaX * scale).addScaledVector(forward, deltaY * scale)
        target.x = THREE.MathUtils.clamp(target.x, movementBounds.min.x, movementBounds.max.x)
        target.z = THREE.MathUtils.clamp(target.z, movementBounds.min.y, movementBounds.max.y)
      }
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

    const anchor = getGroundIntersection(event.clientX, event.clientY)
    if (anchor) {
      zoomAnchor = anchor
    }

    desiredDistance = THREE.MathUtils.clamp(
      desiredDistance * Math.exp(event.deltaY * wheelZoomFactor),
      getMinimumDistance(),
      getMaximumDistance(),
    )
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('pointerup', onPointerUp)
  element.addEventListener('pointerdown', onPointerDown)
  element.addEventListener('pointermove', onPointerMove)
  element.addEventListener('wheel', onWheel, { passive: false })

  return {
    setDistance(nextDistance: number) {
      distance = THREE.MathUtils.clamp(nextDistance, getMinimumDistance(), getMaximumDistance())
      desiredDistance = distance
      zoomAnchor = null
      placeCamera()
    },
    pan(dx: number, dz: number) {
      target.x = THREE.MathUtils.clamp(target.x + dx, movementBounds.min.x, movementBounds.max.x)
      target.z = THREE.MathUtils.clamp(target.z + dz, movementBounds.min.y, movementBounds.max.y)
      zoomAnchor = null
      placeCamera()
    },
    panRelative(screenX: number, screenY: number) {
      const right = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth))
      const forward = new THREE.Vector3(-Math.sin(azimuth), 0, -Math.cos(azimuth))
      target.addScaledVector(right, screenX).addScaledVector(forward, -screenY)
      target.x = THREE.MathUtils.clamp(target.x, movementBounds.min.x, movementBounds.max.x)
      target.z = THREE.MathUtils.clamp(target.z, movementBounds.min.y, movementBounds.max.y)
      zoomAnchor = null
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

        const isUp = pressedKeys.has('ArrowUp') || pressedKeys.has('w')
        const isDown = pressedKeys.has('ArrowDown') || pressedKeys.has('s')
        const isRight = pressedKeys.has('ArrowRight') || pressedKeys.has('d')
        const isLeft = pressedKeys.has('ArrowLeft') || pressedKeys.has('a')

        if (isUp) movement.add(forward)
        if (isDown) movement.sub(forward)
        if (isRight) movement.add(right)
        if (isLeft) movement.sub(right)

        if (movement.lengthSq() > 0) {
          zoomAnchor = null
          movement.normalize().multiplyScalar(movementSpeed * delta)
          target.add(movement)
          target.x = THREE.MathUtils.clamp(target.x, movementBounds.min.x, movementBounds.max.x)
          target.z = THREE.MathUtils.clamp(target.z, movementBounds.min.y, movementBounds.max.y)
        }

        const isRotLeft = pressedKeys.has('q')
        const isRotRight = pressedKeys.has('e')
        const keyRotationRate = 1.8
        if (isRotLeft) desiredAzimuth += keyRotationRate * delta
        if (isRotRight) desiredAzimuth -= keyRotationRate * delta
      }
      const zoomBlend = 1 - Math.exp(-zoomRate * delta)
      const rotationBlend = 1 - Math.exp(-rotationRate * delta)
      const prevDistance = distance
      distance += (desiredDistance - distance) * zoomBlend

      if (zoomAnchor && prevDistance > 1e-4) {
        const ratio = (prevDistance - distance) / prevDistance
        target.x += (zoomAnchor.x - target.x) * ratio
        target.z += (zoomAnchor.z - target.z) * ratio
        target.x = THREE.MathUtils.clamp(target.x, movementBounds.min.x, movementBounds.max.x)
        target.z = THREE.MathUtils.clamp(target.z, movementBounds.min.y, movementBounds.max.y)

        if (Math.abs(desiredDistance - distance) < 1e-3) {
          zoomAnchor = null
        }
      }

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
      window.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('wheel', onWheel)
      element.style.cursor = originalCursor
      pressedKeys.clear()
    },
  }
}
