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
  // Ultra-realistic ocean palette based on physical optical water depth:
  // Deep marine abyss, vibrant lagoon turquoise, and soft surf foam
  const deepOceanColor = new THREE.Color(0x072442)
  const shallowWaterColor = new THREE.Color(0x16a8a4)
  const foamColor = new THREE.Color(0xf2f8fa)

  const material = new THREE.MeshStandardMaterial({
    color: shallowWaterColor,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
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

    shader.vertexShader = `uniform float uOceanTime;\nuniform sampler2D uIslandDepthTexture;\nuniform vec2 uIslandSize;\nvarying vec3 vOceanWorldPosition;\nvarying float vWaveElevation;\nvarying float vSeabedDepth;\n${shader.vertexShader}`

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvOceanWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    )

    // Directional traveling waves with analytical normal perturbation and depth-driven dampening
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      vec2 islandUV = (position.xy / uIslandSize) + 0.5;
      vec2 clampedUV = clamp(islandUV, 0.0, 1.0);
      float rawHeight = texture2D(uIslandDepthTexture, clampedUV).r;
      float edgeDistX = min(islandUV.x, 1.0 - islandUV.x);
      float edgeDistY = min(islandUV.y, 1.0 - islandUV.y);
      float edgeBlend = smoothstep(0.0, 0.06, min(edgeDistX, edgeDistY));
      float vertSeabed = mix(-5.8, rawHeight, edgeBlend);
      float vertWaterDepth = max(0.0, -vertSeabed);

      // Universal depth-governed wave dampening:
      // Shallow waters & gentle lagoons (< 0.8m) are calm, glassy, and tranquil;
      // Deep open ocean (> 3.2m) develops full rolling swells.
      float waveDampening = mix(0.12, 1.0, smoothstep(0.08, 3.2, vertWaterDepth));

      vec2 waveDir1 = vec2(0.852, 0.523);
      vec2 waveDir2 = vec2(-0.451, 0.892);
      vec2 waveDir3 = vec2(0.321, -0.947);

      float waveK1 = 0.042;
      float waveK2 = 0.085;
      float waveK3 = 0.175;

      float phase1 = dot(position.xy, waveDir1) * waveK1 + uOceanTime * 0.72;
      float phase2 = dot(position.xy, waveDir2) * waveK2 + uOceanTime * 1.05;
      float phase3 = dot(position.xy, waveDir3) * waveK3 + uOceanTime * 1.55;

      float amp1 = 0.14 * waveDampening;
      float amp2 = 0.06 * waveDampening;
      float amp3 = 0.025 * waveDampening;

      float dW_dx = cos(phase1) * amp1 * waveK1 * waveDir1.x
                  + cos(phase2) * amp2 * waveK2 * waveDir2.x
                  + cos(phase3) * amp3 * waveK3 * waveDir3.x;

      float dW_dy = cos(phase1) * amp1 * waveK1 * waveDir1.y
                  + cos(phase2) * amp2 * waveK2 * waveDir2.y
                  + cos(phase3) * amp3 * waveK3 * waveDir3.y;

      objectNormal = normalize(vec3(-dW_dx, -dW_dy, 1.0));`,
    )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float wave1 = sin(phase1) * amp1;
      float wave2 = sin(phase2) * amp2;
      float wave3 = sin(phase3) * amp3;
      float totalWave = wave1 + wave2 + wave3;
      transformed.z += totalWave;
      vWaveElevation = totalWave;
      vSeabedDepth = vertSeabed;`,
    )

    shader.fragmentShader = `uniform float uOceanTime;\nuniform sampler2D uIslandDepthTexture;\nuniform vec2 uIslandSize;\nuniform vec3 uDeepOceanColor;\nuniform vec3 uShallowWaterColor;\nuniform vec3 uFoamColor;\nvarying vec3 vOceanWorldPosition;\nvarying float vWaveElevation;\nvarying float vSeabedDepth;\n${shader.fragmentShader}`

    // Micro-surface ripples for sparkling, fluid specular highlights
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      vec2 ripCoord1 = vOceanWorldPosition.xz * 0.22 + vec2(uOceanTime * 0.05, uOceanTime * 0.03);
      vec2 ripCoord2 = vOceanWorldPosition.xz * 0.38 - vec2(uOceanTime * 0.04, -uOceanTime * 0.06);
      float rip1 = sin(ripCoord1.x * 2.5 + ripCoord1.y * 1.8);
      float rip2 = cos(ripCoord2.x * 2.1 - ripCoord2.y * 2.7);
      float ripScale = mix(0.02, 0.055, smoothstep(0.2, 3.0, max(0.0, -vSeabedDepth)));
      normal = normalize(normal + vec3(rip1 * ripScale, rip2 * ripScale, 0.0));`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 islandUV = (vOceanWorldPosition.xz / uIslandSize) + 0.5;
      vec2 clampedUV = clamp(islandUV, 0.0, 1.0);
      vec4 depthSample = texture2D(uIslandDepthTexture, clampedUV);

      float edgeDistX = min(islandUV.x, 1.0 - islandUV.x);
      float edgeDistY = min(islandUV.y, 1.0 - islandUV.y);
      float edgeDist = min(edgeDistX, edgeDistY);
      float edgeBlend = smoothstep(0.0, 0.06, edgeDist);

      float seabedDepth = mix(-5.8, depthSample.r, edgeBlend);

      // Water depth strictly based on physical seabed elevation below water level (y = 0.0)
      float waterDepth = max(0.0, -seabedDepth);

      // Optical color extinction gradient according to water depth (Beer-Lambert attenuation):
      // 1. Crystal translucent shore wash (water depth < 0.4m)
      vec3 crystalShallow = vec3(0.32, 0.88, 0.84);
      // 2. Vibrant tropical reef & shallow beach shelf (0.4m - 1.4m)
      vec3 lagoonTurquoise = uShallowWaterColor;
      // 3. Coastal waters & intermediate shelf (1.4m - 3.6m)
      vec3 coastalAzure    = vec3(0.06, 0.38, 0.54);
      // 4. Deep seabed, cliffs & oceanic abyss (> 4.8m)
      vec3 oceanicAbyss    = uDeepOceanColor;

      // Color determined strictly by water depth:
      // Cliffs drop immediately to 5.5m+ giving deep sapphire right against the rock wall;
      // Beaches slope out gently, creating a broad, radiant turquoise gradient.
      vec3 waterColor = crystalShallow;
      waterColor = mix(waterColor, lagoonTurquoise, smoothstep(0.06, 1.2, waterDepth));
      waterColor = mix(waterColor, coastalAzure,    smoothstep(1.2,  3.6, waterDepth));
      waterColor = mix(waterColor, oceanicAbyss,    smoothstep(3.2,  5.2, waterDepth));

      // Realistic physical Fresnel reflection: glancing angles mirror the sky hemisphere
      float cosTheta = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 4.0);
      vec3 skyAtmosphereColor = vec3(0.722, 0.816, 0.824);
      float fresnelStrength = mix(0.28, 0.52, smoothstep(0.15, 3.2, waterDepth));
      waterColor = mix(waterColor, skyAtmosphereColor, fresnel * fresnelStrength);

      // Shoreline surf foam: naturally restricted to intertidal wave wash right at the sand
      float shoreBand = smoothstep(0.22, 0.01, waterDepth) * smoothstep(-0.22, 0.02, seabedDepth);
      float shoreWave = sin(uOceanTime * 2.2 - seabedDepth * 9.0) * 0.5 + 0.5;
      float shoreLapping = smoothstep(0.38, 0.78, shoreWave);
      float foamIntensity = shoreBand * shoreLapping * 0.65;

      diffuseColor.rgb = mix(waterColor, uFoamColor, foamIntensity);

      // Universal physical transparency:
      // Shallow water (< 0.5m) is crystal-clear with low opacity (0.24 - 0.44),
      // revealing the golden sand bed underneath with pristine transparency.
      // Deep ocean (> 3.6m) is dense and opaque (0.96).
      diffuseColor.a = mix(0.24, 0.96, smoothstep(0.05, 3.6, waterDepth));`,
    )
  }

  material.customProgramCacheKey = () => 'island-ocean-realistic-v7'
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
