import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const assetsDirectory = dirname(fileURLToPath(import.meta.url))
const credits = readFileSync(resolve(assetsDirectory, 'credits.md'), 'utf8')
const models = [
  'environment/mature-scots-pine.glb',
  'environment/rock-09/rock-09.gltf',
]

type GltfDocument = {
  asset?: { version?: string }
  buffers?: Array<{ byteLength: number; uri?: string }>
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number }>
  images?: Array<{ uri?: string; bufferView?: number; mimeType?: string }>
  meshes?: unknown[]
  materials?: unknown[]
}

function parseModel(relativeModelPath: string): GltfDocument {
  const modelPath = resolve(assetsDirectory, relativeModelPath)
  const file = readFileSync(modelPath)

  if (relativeModelPath.toLowerCase().endsWith('.glb')) {
    expect(file.toString('ascii', 0, 4)).toBe('glTF')
    expect(file.readUInt32LE(4)).toBe(2)
    expect(file.readUInt32LE(8)).toBe(file.byteLength)
    expect(file.toString('ascii', 16, 20)).toBe('JSON')
    const jsonLength = file.readUInt32LE(12)
    const model = JSON.parse(file.toString('utf8', 20, 20 + jsonLength).trim()) as GltfDocument
    expect(model.buffers?.[0]?.uri).toBeUndefined()
    expect(model.buffers?.[0]?.byteLength).toBeGreaterThan(0)
    expect(file.subarray(20 + jsonLength + 4, 20 + jsonLength + 8).toString('hex')).toBe('42494e00')
    expect(20 + jsonLength + 8 + model.buffers![0].byteLength!).toBeLessThanOrEqual(file.byteLength)
    for (const image of model.images ?? []) {
      expect(image.bufferView).toBeDefined()
      expect(image.uri).toBeUndefined()
      const view = model.bufferViews![image.bufferView!]
      expect(view.buffer).toBe(0)
      expect(view.byteLength).toBeGreaterThan(0)
      const start = 20 + jsonLength + 8 + (view.byteOffset ?? 0)
      const embedded = file.subarray(start, start + view.byteLength)
      expect(embedded.byteLength).toBe(view.byteLength)
      if (image.mimeType === 'image/png') {
        expect([...embedded.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
        expect(embedded.subarray(-8).toString('hex')).toBe('49454e44ae426082')
      }
    }
    return model
  }

  return JSON.parse(file.toString('utf8')) as GltfDocument
}

function assertModelAndDependencies(relativeModelPath: string) {
  const modelPath = resolve(assetsDirectory, relativeModelPath)
  const model = parseModel(relativeModelPath)

  expect(model.asset?.version).toBe('2.0')
  expect(model.meshes?.length).toBeGreaterThan(0)
  expect(model.materials?.length).toBeGreaterThan(0)
  expect(credits).toContain(relativeModelPath)

  const dependencies: Array<{ uri: string; byteLength?: number }> = [
    ...(model.buffers ?? []).filter((buffer) => buffer.uri).map((buffer) => ({ uri: buffer.uri!, byteLength: buffer.byteLength })),
    ...(model.images ?? []).filter((image) => image.uri).map((image) => ({ uri: image.uri! })),
  ]
  for (const dependency of dependencies) {
    expect(dependency.uri).not.toMatch(/^(https?:)?\/\//i)
    const dependencyPath = resolve(dirname(modelPath), dependency.uri)
    expect(dependencyPath.startsWith(dirname(modelPath))).toBe(true)
    const file = readFileSync(dependencyPath)
    expect(statSync(dependencyPath).size).toBeGreaterThan(0)
    if (dependency.byteLength !== undefined) expect(file.byteLength).toBe(dependency.byteLength)
    if (dependency.uri.toLowerCase().endsWith('.jpg')) {
      expect(file[0]).toBe(0xff)
      expect(file[1]).toBe(0xd8)
      expect(file[file.length - 2]).toBe(0xff)
      expect(file[file.length - 1]).toBe(0xd9)
    }
  }
}

describe('bundled environment models', () => {
  it.each(models)('%s has a credit record and complete local dependencies', (modelPath) => {
    assertModelAndDependencies(modelPath)
  })
})
