import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const root = new URL('../public/incense/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('asset-verification.json', root), 'utf8'))
for (const item of manifest.hashes) {
  const bytes = await readFile(new URL(item.file, root))
  assert.equal(bytes.length, item.bytes, item.file)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, item.file)
}
const human = await readFile(new URL('assets/sam.glb', root))
const gltf = JSON.parse(human.subarray(20, 20 + human.readUInt32LE(12)).toString('utf8').trim())
assert.match(gltf.asset.copyright, /dedicated under CC0 1.0 Universal/)
assert.equal(gltf.skins[0].joints.length, 56)
console.log(`Verified ${manifest.hashes.length} unchanged v2 asset hashes; Sam GLB embedded CC0 dedication and 56-joint rig.`)
