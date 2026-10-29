import type * as THREE from 'three'

export type LevelOfDetailMode = 'closeup' | 'medium' | 'overview' | 'distant'

export type LevelOfDetailConfig = {
  /**
   * Distance in meters from camera to island focal point for close-up mode.
   * Default: 120 meters.
   */
  closeupThreshold?: number
  /**
   * Distance in meters where medium-detail mode transitions to overview.
   * Default: 250 meters.
   */
  mediumThreshold?: number
  /**
   * Distance in meters where overview mode transitions to distant/strategic mode.
   * Default: 600 meters.
   */
  overviewThreshold?: number
  /**
   * Legacy alias for mediumThreshold / overviewThreshold.
   */
  overviewDistanceThreshold?: number
  /**
   * Hysteresis buffer in meters to prevent rapid flickering near threshold boundaries.
   * Default: 15 meters.
   */
  hysteresis?: number
}

export type SceneLodTargets = {
  grassMesh?: THREE.InstancedMesh | null
  farGrassMesh?: THREE.InstancedMesh | null
  fallbackTreeMesh?: THREE.InstancedMesh | null
  fallbackRockMeshes?: THREE.InstancedMesh[] | null
  pbrTreeMeshes?: THREE.InstancedMesh[] | null
  pbrRockMeshes?: THREE.InstancedMesh[] | null
  animalObjects?: THREE.Object3D[] | null
  birdObjects?: THREE.Object3D[] | null
}

/**
 * Manages distance-based 4-tier Level of Detail (LOD) for the 3D island scene:
 *
 * 1. Close-up mode (< 120m):
 *    - Full 3D grass tufts with animated wind sway.
 *    - Full Scots pine PBR needle foliage cards & detailed trunk.
 *    - Photorealistic PBR boulders / full cliff rocks with shadows.
 *    - Ground animals and birds visible.
 *
 * 2. Medium mode (120m - 250m):
 *    - Lightweight line grass instances (saves >95% grass triangle budget).
 *    - Scots pine with optimized foliage cards (preserves silhouette & volume).
 *    - Procedural cliff rocks with shadows.
 *    - Ground animals and birds visible.
 *
 * 3. Overview mode (250m - 600m):
 *    - Grass meshes hidden; rich terrain vertex colors depict meadows.
 *    - Fast overview Scots pine trees / canopy.
 *    - Lightweight rocks (shadow casting disabled) / brown terrain specks.
 *    - Distant ground animals hidden; soaring birds visible.
 *
 * 4. Distant / Strategic mode (>= 600m):
 *    - Grass meshes hidden.
 *    - Minimal canopy silhouette.
 *    - Rock meshes hidden; rocky cliff colors on terrain represent crags.
 *    - Wildlife hidden to maximize GPU throughput when viewing entire island from horizon.
 */
export class LevelOfDetailManager {
  private mode: LevelOfDetailMode = 'overview'
  private readonly closeupThreshold: number
  private readonly mediumThreshold: number
  private readonly overviewThreshold: number
  private readonly hysteresis: number

  constructor(config: LevelOfDetailConfig = {}) {
    this.closeupThreshold = config.closeupThreshold ?? 120
    this.mediumThreshold = config.mediumThreshold ?? (config.overviewDistanceThreshold ?? 250)
    this.overviewThreshold = config.overviewThreshold ?? 600
    this.hysteresis = config.hysteresis ?? 15
  }

  public getMode(): LevelOfDetailMode {
    return this.mode
  }

  public getThreshold(): number {
    return this.mediumThreshold
  }

  public getThresholds(): { closeup: number; medium: number; overview: number } {
    return {
      closeup: this.closeupThreshold,
      medium: this.mediumThreshold,
      overview: this.overviewThreshold,
    }
  }

  /**
   * Evaluates camera distance and applies appropriate 4-tier LOD visibility states across scene elements.
   */
  public update(cameraDistance: number, targets: SceneLodTargets): LevelOfDetailMode {
    if (!Number.isFinite(cameraDistance) || cameraDistance <= 0) {
      return this.mode
    }

    const h = this.hysteresis
    const tClose = this.closeupThreshold
    const tMed = this.mediumThreshold
    const tOver = this.overviewThreshold

    // State transition with hysteresis to prevent jitter/flickering
    switch (this.mode) {
      case 'closeup':
        if (cameraDistance >= tClose + h) {
          if (cameraDistance >= tOver + h) {
            this.mode = 'distant'
          } else if (cameraDistance >= tMed + h) {
            this.mode = 'overview'
          } else {
            this.mode = 'medium'
          }
        }
        break

      case 'medium':
        if (cameraDistance < tClose - h) {
          this.mode = 'closeup'
        } else if (cameraDistance >= tMed + h) {
          if (cameraDistance >= tOver + h) {
            this.mode = 'distant'
          } else {
            this.mode = 'overview'
          }
        }
        break

      case 'overview':
        if (cameraDistance >= tOver + h) {
          this.mode = 'distant'
        } else if (cameraDistance < tMed - h) {
          if (cameraDistance < tClose - h) {
            this.mode = 'closeup'
          } else {
            this.mode = 'medium'
          }
        }
        break

      case 'distant':
        if (cameraDistance < tOver - h) {
          if (cameraDistance < tClose - h) {
            this.mode = 'closeup'
          } else if (cameraDistance < tMed - h) {
            this.mode = 'medium'
          } else {
            this.mode = 'overview'
          }
        }
        break
    }

    const isCloseup = this.mode === 'closeup'
    const isMedium = this.mode === 'medium'
    const isOverview = this.mode === 'overview'
    const isDistant = this.mode === 'distant'

    // 1. Grass Level of Detail
    // Close-up: full 3D grass tufts.
    // Medium: simple line grass.
    // Overview & Distant: grass meshes hidden (terrain vertex color meadows).
    if (targets.grassMesh) {
      targets.grassMesh.visible = isCloseup
    }
    if (targets.farGrassMesh) {
      targets.farGrassMesh.visible = isMedium
    }

    // 2. Tree Level of Detail
    const hasPbrTrees = (targets.pbrTreeMeshes?.length ?? 0) > 0
    if (hasPbrTrees) {
      if (targets.fallbackTreeMesh) {
        targets.fallbackTreeMesh.visible = false
      }
      for (const mesh of targets.pbrTreeMeshes!) {
        const name = mesh.name
        if (name.includes('Close')) {
          if (name.includes('Foliage')) {
            // High needle card density in close-up
            mesh.visible = isCloseup
          } else {
            // Close trunk: visible in closeup and medium
            mesh.visible = isCloseup || isMedium
          }
        } else if (name.includes('Far')) {
          if (name.includes('Foliage')) {
            // Far foliage cards: active in medium, overview, and distant
            mesh.visible = isMedium || isOverview || isDistant
          } else {
            // Far trunk: active in overview and distant
            mesh.visible = isOverview || isDistant
          }
        } else {
          // General tree trunk: always visible
          mesh.visible = true
        }
      }
    } else if (targets.fallbackTreeMesh) {
      targets.fallbackTreeMesh.visible = true
    }

    // 3. Rock Level of Detail
    const hasPbrRocks = (targets.pbrRockMeshes?.length ?? 0) > 0
    if (hasPbrRocks) {
      for (const mesh of targets.pbrRockMeshes!) {
        const name = mesh.name
        if (name.includes('Close')) {
          mesh.visible = isCloseup
        } else if (name.includes('Far')) {
          mesh.visible = isOverview
        } else {
          mesh.visible = isCloseup || isMedium
        }
      }
      if (targets.fallbackRockMeshes) {
        for (const mesh of targets.fallbackRockMeshes) {
          // Medium mode uses fast procedural rocks
          mesh.visible = isMedium
          mesh.castShadow = isMedium
        }
      }
    } else if (targets.fallbackRockMeshes) {
      for (const mesh of targets.fallbackRockMeshes) {
        if (isDistant) {
          mesh.visible = false
        } else {
          mesh.visible = true
          // Disable shadow casting in overview to save shadow map passes
          mesh.castShadow = isCloseup || isMedium
        }
      }
    }

    // 4. Wildlife Level of Detail
    if (targets.animalObjects) {
      const showAnimals = isCloseup || isMedium
      for (const animal of targets.animalObjects) {
        animal.visible = showAnimals
      }
    }

    if (targets.birdObjects) {
      const showBirds = !isDistant
      for (const bird of targets.birdObjects) {
        bird.visible = showBirds
      }
    }

    return this.mode
  }
}
