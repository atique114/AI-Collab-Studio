const encoder = new TextEncoder()

function collectFiles(tree, prefix = '') {
  return Object.entries(tree || {}).flatMap(([name, node]) => {
    const path = prefix ? `${prefix}/${name}` : name
    if (node?.directory) return collectFiles(node.directory, path)
    if (!node?.file) return []

    const safeParts = path.replaceAll('\\', '/').split('/')
    if (safeParts.some(part => !part || part === '.' || part === '..')) return []
    return [{ path: safeParts.join('/'), contents: String(node.file.contents ?? '') }]
  })
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear())
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

function concatenate(parts, size) {
  const output = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

export function createProjectZip(fileTree) {
  const files = collectFiles(fileTree)
  if (!files.length) throw new Error('There are no project files to download yet.')

  const localParts = []
  const centralParts = []
  let localSize = 0
  let centralSize = 0
  const { time, day } = dosDateTime(new Date())

  files.forEach(({ path, contents }) => {
    const name = encoder.encode(path)
    const data = encoder.encode(contents)
    const checksum = crc32(data)

    const localHeader = new Uint8Array(30 + name.length)
    const localView = new DataView(localHeader.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, time, true)
    localView.setUint16(12, day, true)
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, data.length, true)
    localView.setUint32(22, data.length, true)
    localView.setUint16(26, name.length, true)
    localHeader.set(name, 30)
    localParts.push(localHeader, data)

    const centralHeader = new Uint8Array(46 + name.length)
    const centralView = new DataView(centralHeader.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, time, true)
    centralView.setUint16(14, day, true)
    centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, data.length, true)
    centralView.setUint32(24, data.length, true)
    centralView.setUint16(28, name.length, true)
    centralView.setUint32(42, localSize, true)
    centralHeader.set(name, 46)
    centralParts.push(centralHeader)

    localSize += localHeader.length + data.length
    centralSize += centralHeader.length
  })

  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, localSize, true)

  return concatenate([...localParts, ...centralParts, end], localSize + centralSize + end.length)
}

export function projectArchiveFilename(name) {
  const safeName = String(name || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${safeName || 'project'}.zip`
}
