// Store-only ZIP writer. Photos and videos are already compressed, so entries
// are stored without deflating. No dependency, runs entirely in the browser.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    crc = (CRC_TABLE[(crc ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  readonly name: string
  readonly data: Uint8Array<ArrayBuffer>
}

function dosDateTime(now: Date): { readonly time: number; readonly date: number } {
  return {
    time: (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
    date:
      (((now.getFullYear() - 1980) & 0x7f) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate(),
  }
}

export function zipStore(entries: readonly ZipEntry[]): Blob {
  const parts: Uint8Array<ArrayBuffer>[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  const { time, date } = dosDateTime(new Date())
  let offset = 0

  for (const entry of entries) {
    const name = new Uint8Array(new TextEncoder().encode(entry.name))
    const crc = crc32(entry.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // version needed
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true) // store
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, entry.data.length, true)
    local.setUint32(22, entry.data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), name, entry.data)

    const record = new DataView(new ArrayBuffer(46))
    record.setUint32(0, 0x02014b50, true)
    record.setUint16(4, 20, true) // version made by
    record.setUint16(6, 20, true)
    record.setUint16(8, 0x0800, true)
    record.setUint16(10, 0, true)
    record.setUint16(12, time, true)
    record.setUint16(14, date, true)
    record.setUint32(16, crc, true)
    record.setUint32(20, entry.data.length, true)
    record.setUint32(24, entry.data.length, true)
    record.setUint16(28, name.length, true)
    record.setUint32(42, offset, true)
    central.push(new Uint8Array(record.buffer), name)

    offset += 30 + name.length + entry.data.length
  }

  const centralStart = offset
  let centralSize = 0
  for (const part of central) centralSize += part.length

  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, centralStart, true)

  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
    type: "application/zip",
  })
}
