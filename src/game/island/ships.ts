import * as THREE from 'three'

/**
 * Spawns ships sailing in broad orbits around the island with gentle floating sway.
 */
export function addShips(
  scene: THREE.Scene,
  modelTemplate: THREE.Object3D,
): (time: number) => void {
  const shipCount = 3
  const ships: THREE.Object3D[] = []

  for (let i = 0; i < shipCount; i++) {
    const ship = modelTemplate.clone(true)
    ship.scale.set(1.8, 1.8, 1.8)
    ship.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    scene.add(ship)
    ships.push(ship)
  }

  return (time: number) => {
    ships.forEach((ship, i) => {
      const orbitSpeed = 0.12
      const angle = time * orbitSpeed + i * ((Math.PI * 2) / shipCount)
      const radius = 130 + i * 35
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = Math.sin(time * 1.5 + i) * 0.6
      ship.position.set(x, y, z)
      ship.rotation.y = -angle + Math.PI / 2
      ship.rotation.z = Math.sin(time * 2.0 + i) * 0.05
      ship.rotation.x = Math.cos(time * 1.8 + i) * 0.04
    })
  }
}
