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
  // Natural vibrant ocean palette based on aerial tropical and Mediterranean waters:
  // Crystal mint aqua at the sand, radiant Caribbean turquoise lagoon,
  // rich cerulean coastal shelf, and luminous royal sapphire open ocean (never dark murky navy ink).
  const deepOceanColor = new THREE.Color(0x0c5496)
  const shallowWaterColor = new THREE.Color(0x15d1d9)
  const foamColor = new THREE.Color(0xf6fbfb)

  const material = new THREE.MeshStandardMaterial({
    color: shallowWaterColor,
    roughness: 0.10,
    metalness: 0.05,
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

    shader.vertexShader = `uniform float uOceanTime;\nuniform sampler2D uIslandDepthTexture;\nuniform vec2 uIslandSize;\nvarying vec3 vOceanWorldPosition;\nvarying float vWaveElevation;\nvarying float vSeabedDepth;\n${shader.vertexShader}`

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvOceanWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    )

    // Directional traveling waves with analytical normal perturbation and depth-driven dampening
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      // PlaneGeometry rotated around X by -90 deg: world X = position.x, world Z = -position.y
      vec2 worldXZ = vec2(position.x, -position.y);
      vec2 islandUV = (worldXZ / uIslandSize) + 0.5;
      vec2 clampedUV = clamp(islandUV, 0.0, 1.0);
      float rawHeight = texture2D(uIslandDepthTexture, clampedUV).r;
      float distFromCenter = length(clampedUV - vec2(0.5)) * 2.0;
      float radialBlend = 1.0 - smoothstep(0.82, 0.98, distFromCenter);
      float vertSeabed = mix(-5.8, rawHeight, radialBlend);
      float vertWaterDepth = max(0.0, -vertSeabed);

      // Depth-governed wave height & amplitude:
      // Strictly tied to physical water depth based on oceanographic shallow-water wave shoaling:
      // - At the beach waterline (depth = 0.0m): amplitude = 0.0m (calm, glassy, no wave clipping over sand).
      // - In shallow lagoons (depth 0.2m - 1.2m): gentle micro-ripples (amplitude < 0.06m).
      // - In coastal shelf waters (depth 1.2m - 3.8m): swells build gradually (amplitude 0.15m - 0.45m).
      // - In deep open ocean (depth > 4.2m): majestic rolling ocean swells reach full height (~1.15m crest-to-trough).
      float depthFactor = smoothstep(0.0, 4.2, vertWaterDepth);
      float waveDampening = pow(depthFactor, 1.4);

      // Multi-directional cross-swells (perpendicular primary + cross-diagonal)
      // Produces natural, rounded 3D ocean swells with zero directional banding
      vec2 dir1 = vec2(0.966, 0.259);
      vec2 dir2 = vec2(-0.259, 0.966);
      vec2 dir3 = vec2(0.707, 0.707);
      vec2 dir4 = vec2(-0.707, 0.707);

      float k1 = 0.066;
      float k2 = 0.082;
      float k3 = 0.115;
      float k4 = 0.142;

      float p1 = dot(worldXZ, dir1) * k1 + uOceanTime * 0.78;
      float p2 = dot(worldXZ, dir2) * k2 + uOceanTime * 0.88;
      float p3 = dot(worldXZ, dir3) * k3 + uOceanTime * 1.18;
      float p4 = dot(worldXZ, dir4) * k4 + uOceanTime * 1.32;

      float amp1 = 0.46 * waveDampening;
      float amp2 = 0.34 * waveDampening;
      float amp3 = 0.20 * waveDampening;
      float amp4 = 0.15 * waveDampening;

      // Trochoidal wave shaping: sharp rounded peaks and broad natural troughs
      float s1 = sin(p1);
      float s2 = sin(p2);
      float s3 = sin(p3);
      float s4 = sin(p4);

      float u1 = s1 * 0.5 + 0.5;
      float u2 = s2 * 0.5 + 0.5;
      float u3 = s3 * 0.5 + 0.5;
      float u4 = s4 * 0.5 + 0.5;

      float dW_dx = cos(p1) * amp1 * k1 * dir1.x * (1.35 * pow(u1, 0.35))
                  + cos(p2) * amp2 * k2 * dir2.x * (1.35 * pow(u2, 0.35))
                  + cos(p3) * amp3 * k3 * dir3.x * (1.35 * pow(u3, 0.35))
                  + cos(p4) * amp4 * k4 * dir4.x * (1.35 * pow(u4, 0.35));

      float dW_dz = cos(p1) * amp1 * k1 * dir1.y * (1.35 * pow(u1, 0.35))
                  + cos(p2) * amp2 * k2 * dir2.y * (1.35 * pow(u2, 0.35))
                  + cos(p3) * amp3 * k3 * dir3.y * (1.35 * pow(u3, 0.35))
                  + cos(p4) * amp4 * k4 * dir4.y * (1.35 * pow(u4, 0.35));

      // In local coordinates: d(transformed.z)/d(local.y) = -dW_dz, so normal = (-dW_dx, dW_dz, 1.0)
      objectNormal = normalize(vec3(-dW_dx, dW_dz, 1.0));`,
    )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float wave1 = (pow(u1, 1.35) * 2.0 - 1.0) * amp1;
      float wave2 = (pow(u2, 1.35) * 2.0 - 1.0) * amp2;
      float wave3 = (pow(u3, 1.35) * 2.0 - 1.0) * amp3;
      float wave4 = (pow(u4, 1.35) * 2.0 - 1.0) * amp4;
      float totalWave = wave1 + wave2 + wave3 + wave4;
      transformed.z += totalWave;
      vWaveElevation = totalWave;
      vSeabedDepth = vertSeabed;`,
    )

    shader.fragmentShader = `uniform float uOceanTime;\nuniform sampler2D uIslandDepthTexture;\nuniform vec2 uIslandSize;\nuniform vec3 uDeepOceanColor;\nuniform vec3 uShallowWaterColor;\nuniform vec3 uFoamColor;\nvarying vec3 vOceanWorldPosition;\nvarying float vWaveElevation;\nvarying float vSeabedDepth;\n${shader.fragmentShader}`

    // Micro-surface ripples for sparkling, fluid specular highlights
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      // Domain-warped circular organic water ripples (eliminates any artificial linear patterns)
      vec2 p = vOceanWorldPosition.xz * 0.08;
      float t = uOceanTime * 0.65;
      float rip1 = sin(p.x * 2.4 + sin(p.y * 2.0 + t * 0.9) * 1.6 + t * 0.7);
      float rip2 = cos(p.y * 2.4 + sin(p.x * 2.0 - t * 0.8) * 1.6 - t * 0.6);

      vec2 p2 = vOceanWorldPosition.xz * 0.16;
      float rip3 = sin(dot(p2, vec2(1.5, 1.2)) + cos(dot(p2, vec2(-1.2, 1.4)) + t * 1.2));
      float rip4 = cos(dot(p2, vec2(-1.3, 1.1)) + sin(dot(p2, vec2(1.2, -1.3)) - t * 1.1));

      float ripScale = mix(0.02, 0.05, smoothstep(0.2, 3.5, max(0.0, -vSeabedDepth)));
      vec2 rippleVec = vec2(rip1 + rip3 * 0.4, rip2 + rip4 * 0.4) * ripScale;
      normal = normalize(normal + vec3(rippleVec.x, rippleVec.y, 0.0));`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 islandUV = (vOceanWorldPosition.xz / uIslandSize) + 0.5;
      vec2 clampedUV = clamp(islandUV, 0.0, 1.0);
      vec4 depthSample = texture2D(uIslandDepthTexture, clampedUV);

      float distFromCenter = length(clampedUV - vec2(0.5)) * 2.0;
      float radialBlend = 1.0 - smoothstep(0.82, 0.98, distFromCenter);
      float seabedDepth = mix(-5.8, depthSample.r, radialBlend);

      // Water depth strictly based on physical seabed elevation below water level (y = 0.0)
      float waterDepth = max(0.0, -seabedDepth);

      // Authentic aerial tropical island & Mediterranean sea gradient:
      // 1. Crystal translucent mint-aqua at the shoreline sand (0.0m - 0.4m)
      vec3 shoreTranslucent = vec3(0.48, 0.96, 0.92);
      // 2. Vibrant glowing Caribbean turquoise lagoon (0.4m - 1.6m)
      vec3 lagoonTurquoise  = uShallowWaterColor;
      // 3. Sunny tropical cyan-azure coastal shelf (1.6m - 3.2m)
      vec3 coastalCyan      = vec3(0.08, 0.65, 0.88);
      // 4. Rich Mediterranean azure blue (3.2m - 4.6m)
      vec3 mediterraneanAzure = vec3(0.06, 0.44, 0.74);
      // 5. Open ocean royal sapphire blue (never dark murky black/navy ink) (> 4.6m)
      vec3 oceanicSapphire  = uDeepOceanColor;

      // Color smoothly determined by physical water depth:
      // Cliffs plunge abruptly to >5.5m producing deep oceanic sapphire blue right at the rock;
      // Beaches slope gently, producing an expansive luminous turquoise-to-azure gradient.
      vec3 waterColor = shoreTranslucent;
      waterColor = mix(waterColor, lagoonTurquoise,    smoothstep(0.04, 1.0, waterDepth));
      waterColor = mix(waterColor, coastalCyan,        smoothstep(1.0,  2.8, waterDepth));
      waterColor = mix(waterColor, mediterraneanAzure, smoothstep(2.8,  4.4, waterDepth));
      waterColor = mix(waterColor, oceanicSapphire,    smoothstep(4.2,  5.8, waterDepth));

      // Realistic physical Fresnel reflection: glancing angles mirror the sky hemisphere
      float cosTheta = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
      float fresnel = 0.03 + 0.97 * pow(1.0 - cosTheta, 4.0);
      vec3 skyAtmosphereColor = vec3(0.72, 0.86, 0.94);
      float fresnelStrength = mix(0.18, 0.38, smoothstep(0.1, 4.0, waterDepth));
      waterColor = mix(waterColor, skyAtmosphereColor, fresnel * fresnelStrength);

      // Deep-water wave elevation shading:
      // Wave crests scatter light as they elevate in deep water, giving realistic 3D volume,
      // while troughs plunge into deeper, richer ocean sapphire tones.
      float deepWaterFactor = smoothstep(2.5, 5.0, waterDepth);
      float crestShading = clamp(vWaveElevation * 0.16, -0.06, 0.10) * deepWaterFactor;
      waterColor += vec3(0.04, 0.12, 0.18) * crestShading;

      // Shoreline surf foam: naturally restricted to intertidal wave wash right at the sand
      float shoreBand = smoothstep(0.35, 0.01, waterDepth) * smoothstep(-0.35, 0.02, seabedDepth);
      float shoreWave = sin(uOceanTime * 2.2 - seabedDepth * 8.0) * 0.5 + 0.5;
      float shoreLapping = smoothstep(0.35, 0.78, shoreWave);
      float shoreFoam = shoreBand * shoreLapping * 0.75;

      diffuseColor.rgb = mix(waterColor, uFoamColor, shoreFoam);

      // Universal physical transparency:
      // Shallow water (< 0.5m) is crystal-clear (opacity 0.30 - 0.50), revealing the golden sand
      // bed underneath with stunning transparency. Deep water (> 3.5m) is dense and opaque (0.97).
      diffuseColor.a = mix(0.30, 0.97, smoothstep(0.04, 3.5, waterDepth));`,
    )
  }

  material.customProgramCacheKey = () => 'island-ocean-realistic-v12'
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
