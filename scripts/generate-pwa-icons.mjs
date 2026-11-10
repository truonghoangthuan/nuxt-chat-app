import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

function parseHexColor(hex) {
  const clean = hex.replace('#', '').trim()
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
    255,
  ]
}

function parseSvgPathData(d, tx, ty, steps = 20) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []
  const points = []
  let i = 0
  let cmd = ''
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0

  while (i < tokens.length) {
    const t = tokens[i]
    if (/^[a-zA-Z]$/.test(t)) {
      cmd = t
      i++
      if (cmd === 'z' || cmd === 'Z') {
        cx = sx
        cy = sy
        continue
      }
    }

    if (cmd === 'm' || cmd === 'M') {
      const x = parseFloat(tokens[i++])
      const y = parseFloat(tokens[i++])
      cx = cmd === 'm' ? cx + x : x
      cy = cmd === 'm' ? cy + y : y
      sx = cx
      sy = cy
      points.push([cx + tx, cy + ty])
      cmd = cmd === 'm' ? 'l' : 'L'
    } else if (cmd === 'l' || cmd === 'L') {
      const x = parseFloat(tokens[i++])
      const y = parseFloat(tokens[i++])
      cx = cmd === 'l' ? cx + x : x
      cy = cmd === 'l' ? cy + y : y
      points.push([cx + tx, cy + ty])
    } else if (cmd === 'c' || cmd === 'C') {
      const x1 = parseFloat(tokens[i++])
      const y1 = parseFloat(tokens[i++])
      const x2 = parseFloat(tokens[i++])
      const y2 = parseFloat(tokens[i++])
      const x = parseFloat(tokens[i++])
      const y = parseFloat(tokens[i++])

      const p0x = cx
      const p0y = cy
      const p1x = cmd === 'c' ? cx + x1 : x1
      const p1y = cmd === 'c' ? cy + y1 : y1
      const p2x = cmd === 'c' ? cx + x2 : x2
      const p2y = cmd === 'c' ? cy + y2 : y2
      const p3x = cmd === 'c' ? cx + x : x
      const p3y = cmd === 'c' ? cy + y : y

      for (let s = 1; s <= steps; s++) {
        const u = s / steps
        const inv = 1 - u
        const bx = inv * inv * inv * p0x + 3 * inv * inv * u * p1x + 3 * inv * u * u * p2x + u * u * u * p3x
        const by = inv * inv * inv * p0y + 3 * inv * inv * u * p1y + 3 * inv * u * u * p2y + u * u * u * p3y
        points.push([bx + tx, by + ty])
      }
      cx = p3x
      cy = p3y
    } else {
      i++
    }
  }
  return points
}

let cachedSvgModel = null

function loadUbuntuLogoModel() {
  if (cachedSvgModel) return cachedSvgModel

  const svgPath = path.resolve(process.cwd(), 'src-tauri', 'icons', 'ubuntu-logo.svg')
  const svgContent = fs.readFileSync(svgPath, 'utf8')

  const vbMatch = svgContent.match(/viewBox="([^"]+)"/)
  const [, , vbW, vbH] = (vbMatch ? vbMatch[1].trim().split(/\s+/).map(Number) : [0, 0, 2126.9644, 2126.9644])

  const transMatch = svgContent.match(/transform="translate\(([^,]+),([^)]+)\)"/)
  const tx = transMatch ? parseFloat(transMatch[1]) : 0
  const ty = transMatch ? parseFloat(transMatch[2]) : 0

  const shapes = []
  const pathRegex = /<path[^>]*d="([^"]+)"[^>]*style="([^"]+)"[^>]*>/g
  let match
  while ((match = pathRegex.exec(svgContent)) !== null) {
    const d = match[1]
    const style = match[2]
    const fillMatch = style.match(/fill:(#[0-9a-fA-F]{6})/)
    const fill = fillMatch ? parseHexColor(fillMatch[1]) : [255, 255, 255, 255]
    const points = parseSvgPathData(d, tx, ty, 24)
    if (points.length >= 3) {
      shapes.push({ points, fill })
    }
  }

  cachedSvgModel = { vbW, vbH, shapes }
  return cachedSvgModel
}

function rasterizePolygonToGrid(points, scaleX, scaleY, gridW, gridH, colorId, grid) {
  const n = points.length
  let minY = gridH
  let maxY = 0
  const scaled = new Array(n)
  for (let i = 0; i < n; i++) {
    const sx = points[i][0] * scaleX
    const sy = points[i][1] * scaleY
    scaled[i] = [sx, sy]
    if (sy < minY) minY = sy
    if (sy > maxY) maxY = sy
  }

  const startY = Math.max(0, Math.floor(minY))
  const endY = Math.min(gridH - 1, Math.ceil(maxY))
  const intersections = []

  for (let y = startY; y <= endY; y++) {
    const scanY = y + 0.5
    intersections.length = 0

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const x0 = scaled[j][0], y0 = scaled[j][1]
      const x1 = scaled[i][0], y1 = scaled[i][1]
      if ((y0 <= scanY && y1 > scanY) || (y1 <= scanY && y0 > scanY)) {
        const x = x0 + ((scanY - y0) * (x1 - x0)) / (y1 - y0)
        intersections.push(x)
      }
    }

    intersections.sort((a, b) => a - b)

    const rowOffset = y * gridW
    for (let k = 0; k + 1 < intersections.length; k += 2) {
      const xStart = Math.max(0, Math.floor(intersections[k] + 0.5))
      const xEnd = Math.min(gridW - 1, Math.floor(intersections[k + 1] - 0.5))
      for (let x = xStart; x <= xEnd; x++) {
        grid[rowOffset + x] = colorId
      }
    }
  }
}

export function generatePng(size) {
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

  const { vbW, vbH, shapes } = loadUbuntuLogoModel()
  const ss = 4 // 4x4 supersampling for smooth anti-aliased edges
  const gridW = width * ss
  const gridH = height * ss
  const grid = new Uint8Array(gridW * gridH)
  const palette = [[0, 0, 0, 0]]

  const scaleX = gridW / vbW
  const scaleY = gridH / vbH

  for (let idx = 0; idx < shapes.length; idx++) {
    const colorId = idx + 1
    palette[colorId] = shapes[idx].fill
    rasterizePolygonToGrid(shapes[idx].points, scaleX, scaleY, gridW, gridH, colorId, grid)
  }

  // Downsample 4x4 grid into RGBA scanlines
  const bytesPerPixel = 4
  const rowStride = 1 + width * bytesPerPixel
  const rawData = Buffer.alloc(height * rowStride)
  const samples = ss * ss

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride
    rawData[rowOffset] = 0 // Filter 0 (None)
    const gyBase = y * ss

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * bytesPerPixel
      const gxBase = x * ss
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0

      for (let sy = 0; sy < ss; sy++) {
        const gRow = (gyBase + sy) * gridW + gxBase
        for (let sx = 0; sx < ss; sx++) {
          const cid = grid[gRow + sx]
          if (cid !== 0) {
            const c = palette[cid]
            rSum += c[0]
            gSum += c[1]
            bSum += c[2]
            aSum += c[3]
          }
        }
      }

      if (aSum > 0) {
        const hits = aSum / 255
        rawData[pxOffset] = Math.round(rSum / hits)
        rawData[pxOffset + 1] = Math.round(gSum / hits)
        rawData[pxOffset + 2] = Math.round(bSum / hits)
        rawData[pxOffset + 3] = Math.round(aSum / samples)
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData)
  const idatChunk = createChunk('IDAT', compressedData)
  const iendChunk = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

export function generateIcoFromPng(pngBuf) {
  const header = Buffer.alloc(22)
  // ICONDIR (6 bytes)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = ICO
  header.writeUInt16LE(1, 4) // count: 1 image

  // ICONDIRENTRY (16 bytes)
  header.writeUInt8(0, 6) // width: 0 = 256px
  header.writeUInt8(0, 7) // height: 0 = 256px
  header.writeUInt8(0, 8) // color count: 0 (>=8bpp)
  header.writeUInt8(0, 9) // reserved: 0
  header.writeUInt16LE(1, 10) // color planes: 1
  header.writeUInt16LE(32, 12) // bits per pixel: 32
  header.writeUInt32LE(pngBuf.length, 14) // size of image data in bytes
  header.writeUInt32LE(22, 18) // offset of image data from beginning of file

  return Buffer.concat([header, pngBuf])
}

export function generateAllIcons() {
  const publicDir = path.resolve(process.cwd(), 'public')
  fs.mkdirSync(publicDir, { recursive: true })
  for (const size of [192, 512]) {
    const filePath = path.join(publicDir, `pwa-${size}x${size}.png`)
    const pngBuf = generatePng(size)
    fs.writeFileSync(filePath, pngBuf)
    console.log(`Generated ${filePath} (${pngBuf.length} bytes)`)
  }

  const tauriIconsDir = path.resolve(process.cwd(), 'src-tauri', 'icons')
  fs.mkdirSync(tauriIconsDir, { recursive: true })

  const tauriSizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
  ]

  let png256 = null
  for (const { name, size } of tauriSizes) {
    const filePath = path.join(tauriIconsDir, name)
    const pngBuf = size === 256 && png256 ? png256 : generatePng(size)
    if (size === 256) png256 = pngBuf
    fs.writeFileSync(filePath, pngBuf)
    console.log(`Generated ${filePath} (${pngBuf.length} bytes)`)
  }

  if (!png256) {
    png256 = generatePng(256)
  }
  const icoBuf = generateIcoFromPng(png256)
  const icoPath = path.join(tauriIconsDir, 'icon.ico')
  fs.writeFileSync(icoPath, icoBuf)
  console.log(`Generated ${icoPath} (${icoBuf.length} bytes)`)
}

const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) ||
  process.argv[1].endsWith('generate-pwa-icons.mjs')
)

if (isMain) {
  generateAllIcons()
}
