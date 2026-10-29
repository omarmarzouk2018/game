import * as THREE from 'three'

/**
 * Checks whether an Object3D is an overly heavy placeholder (such as a 12k-triangle photogrammetric rock).
 */
function isHeavyPlaceholder(obj: THREE.Object3D): boolean {
  let vertexCount = 0
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      vertexCount += child.geometry.attributes.position?.count ?? 0
    }
  })
  return vertexCount > 1000
}

/**
 * Creates a charming, lightweight historic coastal sailboat (~48 triangles).
 * Avoids cloning 12,000-triangle rock models as ships into the ocean.
 */
export function createShipModel(
  resources?: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
): THREE.Object3D {
  const group = new THREE.Group()
  group.name = 'LowPolyShip'

  // Weathered oak wood material
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x4e331e,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  })
  resources?.add(woodMaterial)

  // Canvas sail material
  const sailMaterial = new THREE.MeshStandardMaterial({
    color: 0xf6f3eb,
    roughness: 0.65,
    metalness: 0.02,
    side: THREE.DoubleSide,
    flatShading: true,
  })
  resources?.add(sailMaterial)

  // Boat hull: tapered wooden vessel
  const hullGeo = new THREE.BoxGeometry(2.0, 1.1, 5.2)
  resources?.add(hullGeo)
  const hull = new THREE.Mesh(hullGeo, woodMaterial)
  hull.position.set(0, 0.45, 0)
  group.add(hull)

  // Deck cabin
  const cabinGeo = new THREE.BoxGeometry(1.4, 0.7, 1.6)
  resources?.add(cabinGeo)
  const cabin = new THREE.Mesh(cabinGeo, woodMaterial)
  cabin.position.set(0, 1.1, -1.2)
  group.add(cabin)

  // Central wooden mast
  const mastGeo = new THREE.CylinderGeometry(0.08, 0.1, 4.6, 5)
  resources?.add(mastGeo)
  const mast = new THREE.Mesh(mastGeo, woodMaterial)
  mast.position.set(0, 2.7, 0.3)
  group.add(mast)

  // Triangular mainsail
  const sailGeo = new THREE.BufferGeometry()
  const sailPositions = new Float32Array([
    // Triangle: mast top, boom out, mast base
    0, 4.6, 0.3,
    0, 1.5, 0.3,
    0.05, 1.6, -1.9,
  ])
  sailGeo.setAttribute('position', new THREE.BufferAttribute(sailPositions, 3))
  sailGeo.computeVertexNormals()
  resources?.add(sailGeo)
  const sail = new THREE.Mesh(sailGeo, sailMaterial)
  group.add(sail)

  // Jib headsail (front triangle)
  const jibGeo = new THREE.BufferGeometry()
  const jibPositions = new Float32Array([
    0, 3.8, 0.3,
    0, 1.3, 2.4,
    0, 1.3, 0.6,
  ])
  jibGeo.setAttribute('position', new THREE.BufferAttribute(jibPositions, 3))
  jibGeo.computeVertexNormals()
  resources?.add(jibGeo)
  const jib = new THREE.Mesh(jibGeo, sailMaterial)
  group.add(jib)

  return group
}

/**
 * Spawns ships sailing in broad orbits around the island with gentle floating sway.
 * Ships do not cast heavy terrain shadows onto the ocean surface.
 */
export function addShips(
  scene: THREE.Scene,
  modelTemplate?: THREE.Object3D,
  resources?: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
): (time: number) => void {
  const shipCount = 3
  const ships: THREE.Object3D[] = []

  // Use dedicated low-poly ship model if template is omitted or a heavy placeholder
  const effectiveTemplate =
    modelTemplate && !isHeavyPlaceholder(modelTemplate)
      ? modelTemplate
      : createShipModel(resources)

  for (let i = 0; i < shipCount; i++) {
    const ship = effectiveTemplate.clone(true)
    ship.scale.set(1.4, 1.4, 1.4)

    // Optimization: Ocean ships do not cast terrain shadows
    ship.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false
        child.receiveShadow = true
        if (resources) {
          resources.add(child.geometry)
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach((m) => resources.add(m))
        }
      }
    })

    scene.add(ship)
    ships.push(ship)
  }

  return (time: number) => {
    ships.forEach((ship, i) => {
      const orbitSpeed = 0.09
      const angle = time * orbitSpeed + i * ((Math.PI * 2) / shipCount)
      const radius = 135 + i * 35
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = Math.sin(time * 1.5 + i) * 0.45

      ship.position.set(x, y, z)
      ship.rotation.y = -angle + Math.PI / 2
      ship.rotation.z = Math.sin(time * 2.0 + i) * 0.05
      ship.rotation.x = Math.cos(time * 1.8 + i) * 0.04
    })
  }
}
