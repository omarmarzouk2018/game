import * as THREE from 'three'
import { sampleIslandTerrain, type IslandTerrain } from './terrain'

/**
 * Creates a DataTexture containing island terrain height and depth values for ocean shader sampling.
 */
export function createIslandDepthTexture(terrain: IslandTerrain): THREE.DataTexture {
  const size = 256
  const data = new Float32Array(size * size * 4)

  for (let row = 0; row < size; row += 1) {
    const z = (row / (size - 1) - 0.5) * terrain.depth
    for (let col = 0; col < size; col += 1) {
      const x = (col / (size - 1) - 0.5) * terrain.width
      const sample = sampleIslandTerrain(terrain, x, z)
      const index = (row * size + col) * 4
      data[index] = sample.height
      data[index + 1] = sample.land ? 1.0 : 0.0
      data[index + 2] = Math.max(0.0, Math.min(1.0, (sample.height + 6.0) / 12.0))
      data[index + 3] = 1.0
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

/**
 * Creates ocean material with procedural wave elevation and depth-based shoreline foam shaders.
 */
export function createOceanMaterial(
  depthTexture: THREE.DataTexture,
  islandWidth = 440,
  islandDepth = 440,
): THREE.MeshStandardMaterial {
  const deepOceanColor = new THREE.Color(0x051e33)
  const shallowWaterColor = new THREE.Color(0x1faec4)
  const foamColor = new THREE.Color(0xf2f8ff)

  const material = new THREE.MeshStandardMaterial({
    color: shallowWaterColor,
    roughness: 0.22,
    metalness: 0.08,
    transparent: true,
    opacity: 0.94,
  })

  const oceanUniforms = {
    uOceanTime: { value: 0 },
    uIslandDepthTexture: { value: depthTexture },
    uIslandSize: { value: new THREE.Vector2(islandWidth, islandDepth) },
    uDeepOceanColor: { value: deepOceanColor },
    uShallowWaterColor: { value: shallowWaterColor },
    uFoamColor: { value: foamColor },
  }

  material.userData.oceanUniforms = oceanUniforms

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOceanTime = oceanUniforms.uOceanTime
    shader.uniforms.uIslandDepthTexture = oceanUniforms.uIslandDepthTexture
    shader.uniforms.uIslandSize = oceanUniforms.uIslandSize
    shader.uniforms.uDeepOceanColor = oceanUniforms.uDeepOceanColor
    shader.uniforms.uShallowWaterColor = oceanUniforms.uShallowWaterColor
    shader.uniforms.uFoamColor = oceanUniforms.uFoamColor

    shader.vertexShader = `uniform float uOceanTime;\nvarying vec3 vOceanWorldPosition;\nvarying float vWaveElevation;\n${shader.vertexShader}`

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvOceanWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float wave1 = sin(position.x * 0.045 + uOceanTime * 0.75) * cos(position.y * 0.038 + uOceanTime * 0.55) * 0.18;
      float wave2 = sin((position.x * 0.072 - position.y * 0.065) + uOceanTime * 0.95) * 0.09;
      float wave3 = sin((position.x * 0.16 + position.y * 0.13) + uOceanTime * 1.4) * 0.04;
      float totalWave = wave1 + wave2 + wave3;
      transformed.z += totalWave;
      vWaveElevation = totalWave;`,
    )

    shader.fragmentShader = `uniform float uOceanTime;\nuniform sampler2D uIslandDepthTexture;\nuniform vec2 uIslandSize;\nuniform vec3 uDeepOceanColor;\nuniform vec3 uShallowWaterColor;\nuniform vec3 uFoamColor;\nvarying vec3 vOceanWorldPosition;\nvarying float vWaveElevation;\n${shader.fragmentShader}`

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 islandUV = (vOceanWorldPosition.xz / uIslandSize) + 0.5;
      float seabedDepth = -6.0;

      float edgeDistX = min(islandUV.x, 1.0 - islandUV.x);
      float edgeDistY = min(islandUV.y, 1.0 - islandUV.y);
      float edgeDist = min(edgeDistX, edgeDistY);
      float edgeBlend = smoothstep(0.0, 0.06, edgeDist);

      if (islandUV.x >= 0.0 && islandUV.x <= 1.0 && islandUV.y >= 0.0 && islandUV.y <= 1.0) {
        vec4 depthSample = texture2D(uIslandDepthTexture, islandUV);
        seabedDepth = mix(-6.0, depthSample.r, edgeBlend);
      }

      // Depth gradient: deep blue offshore to vibrant turquoise in shallow waters
      float shallowFactor = smoothstep(-5.0, 0.2, seabedDepth);
      vec3 waterColor = mix(uDeepOceanColor, uShallowWaterColor, shallowFactor);

      // Distant horizon fog blending
      float distanceFromIsland = length(vOceanWorldPosition.xz);
      float horizonFog = smoothstep(550.0, 850.0, distanceFromIsland);
      waterColor = mix(waterColor, vec3(0.72, 0.816, 0.824), horizonFog);

      // Shoreline foam line where water meets island shore
      float shoreDist = abs(seabedDepth - 0.05);
      float foamBand = 1.0 - smoothstep(0.0, 0.45, shoreDist);
      float foamNoise = sin(vOceanWorldPosition.x * 0.85 + uOceanTime * 2.2) * cos(vOceanWorldPosition.z * 0.85 - uOceanTime * 1.8);
      float foamWave = sin(uOceanTime * 2.6 - seabedDepth * 14.0) * 0.5 + 0.5;
      float foamIntensity = foamBand * smoothstep(0.25, 0.75, foamWave + foamNoise * 0.35);

      // Open water wave crest foam
      float crestFoam = smoothstep(0.19, 0.29, vWaveElevation) * 0.45;
      foamIntensity = max(foamIntensity, crestFoam);

      // Animated sunlit specular wave glint
      float glint = pow(max(0.0, sin(vOceanWorldPosition.x * 0.11 + uOceanTime * 0.8) * sin(vOceanWorldPosition.z * 0.09 - uOceanTime * 0.6)), 24.0) * 0.07;

      diffuseColor.rgb = mix(waterColor, uFoamColor, foamIntensity) + glint;`,
    )
  }

  material.customProgramCacheKey = () => 'island-ocean-waves-v2'
  return material
}

/**
 * Adds the ocean plane mesh with depth texture sampling and returns an animation update callback.
 */
export function addOcean(
  scene: THREE.Scene,
  terrain: IslandTerrain,
  resources: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
): (time: number) => void {
  const depthTexture = createIslandDepthTexture(terrain)
  const geometry = new THREE.PlaneGeometry(1600, 1600, 160, 160)
  const material = createOceanMaterial(depthTexture, terrain.width, terrain.depth)

  resources.add(geometry)
  resources.add(material)
  resources.add(depthTexture)

  const ocean = new THREE.Mesh(geometry, material)
  ocean.rotation.x = -Math.PI / 2
  ocean.position.y = 0
  ocean.receiveShadow = true
  scene.add(ocean)

  return (time) => {
    const uniform = material.userData.oceanUniforms?.uOceanTime as { value: number } | undefined
    if (uniform) uniform.value = time
  }
}
