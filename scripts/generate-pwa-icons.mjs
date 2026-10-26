import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// Precompute CRC32 table
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c >>> 0
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createChunk(typeStr, dataBuf) {
  const typeBuf = Buffer.from(typeStr, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(dataBuf.length, 0)

  const toCrc = Buffer.concat([typeBuf, dataBuf])
  const crcVal = crc32(toCrc)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crcVal, 0)

  return Buffer.concat([lenBuf, toCrc, crcBuf])
}

function generatePng(size) {
  const width = size
  const height = size
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // IHDR (13 bytes)
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // color type 6: RGBA
  ihdrData[10] = 0 // compression method 0
  ihdrData[11] = 0 // filter method 0
  ihdrData[12] = 0 // interlace 0
  const ihdrChunk = createChunk('IHDR', ihdrData)

  // Raw Scanlines: filter byte 0 + RGBA per pixel
  const bytesPerPixel = 4
  const rowStride = 1 + width * bytesPerPixel
  const rawData = Buffer.alloc(height * rowStride)

  const bgR = 0x0b, bgG = 0x0f, bgB = 0x17 // #0b0f17
  const fgR = 0x10, fgG = 0xb9, fgB = 0x81 // #10b981 emerald
  const center = size / 2
  const iconRadius = size * 0.38
  const innerRadius = size * 0.22

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride
    rawData[rowOffset] = 0 // Filter 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * bytesPerPixel
      const dx = x - center
      const dy = y - center
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Rounded app badge with emerald coffee-mug center motif
      if (dist <= iconRadius && dist >= innerRadius) {
        // Outer decorative ring
        rawData[pxOffset] = fgR
        rawData[pxOffset + 1] = fgG
        rawData[pxOffset + 2] = fgB
        rawData[pxOffset + 3] = 0xff
      } else if (dist < innerRadius && Math.abs(dx) <= innerRadius * 0.65 && dy >= -innerRadius * 0.3 && dy <= innerRadius * 0.7) {
        // Center cup body
        rawData[pxOffset] = fgR
        rawData[pxOffset + 1] = fgG
        rawData[pxOffset + 2] = fgB
        rawData[pxOffset + 3] = 0xff
      } else {
        // Dark studio background
        rawData[pxOffset] = bgR
        rawData[pxOffset + 1] = bgG
        rawData[pxOffset + 2] = bgB
        rawData[pxOffset + 3] = 0xff
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData)
  const idatChunk = createChunk('IDAT', compressedData)
  const iendChunk = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

const outDir = path.resolve(process.cwd(), 'public')
for (const size of [192, 512]) {
  const filePath = path.join(outDir, `pwa-${size}x${size}.png`)
  const pngBuf = generatePng(size)
  fs.writeFileSync(filePath, pngBuf)
  console.log(`Generated ${filePath} (${pngBuf.length} bytes)`)
}
