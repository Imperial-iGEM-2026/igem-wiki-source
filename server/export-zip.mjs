import { createReadStream } from 'node:fs';
import { crc32 } from 'node:zlib';

// Stored ZIP64: bounded memory, backpressure and no compression CPU for large media.
// Entries have {name, size, file} or {name, size, data: Buffer}.
export async function* zipStream(entries) {
  let offset = 0n;
  const central = [];
  for (const entry of entries) {
    if (
      !entry.name ||
      entry.name.startsWith('/') ||
      entry.name.split('/').includes('..') ||
      entry.name.includes('\\')
    )
      throw Error('Invalid ZIP entry');
    const name = Buffer.from(entry.name);
    const size = BigInt(entry.size);
    const header = Buffer.alloc(30 + name.length + 20);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(45, 4);
    header.writeUInt16LE(0x808, 6); // UTF-8 and trailing data descriptor.
    header.writeUInt16LE(33, 12); // 1980-01-01
    header.writeUInt32LE(0xffffffff, 18);
    header.writeUInt32LE(0xffffffff, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(20, 28);
    name.copy(header, 30);
    const extra = 30 + name.length;
    header.writeUInt16LE(1, extra);
    header.writeUInt16LE(16, extra + 2);
    header.writeBigUInt64LE(size, extra + 4);
    header.writeBigUInt64LE(size, extra + 12);
    const start = offset;
    yield header;
    offset += BigInt(header.length);
    let crc = 0,
      bytes = 0n;
    const stream = entry.file ? createReadStream(entry.file) : null;
    try {
      for await (const chunk of stream || [entry.data]) {
        bytes += BigInt(chunk.length);
        if (bytes > size)
          throw Error('Export file changed. Prepare the export again.');
        crc = crc32(chunk, crc);
        offset += BigInt(chunk.length);
        yield chunk;
      }
    } finally {
      stream?.destroy();
    }
    if (bytes !== size)
      throw Error('Export file changed. Prepare the export again.');
    const descriptor = Buffer.alloc(24);
    descriptor.writeUInt32LE(0x08074b50);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeBigUInt64LE(size, 8);
    descriptor.writeBigUInt64LE(size, 16);
    yield descriptor;
    offset += 24n;
    const record = Buffer.alloc(46 + name.length + 28);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(45, 4);
    record.writeUInt16LE(45, 6);
    record.writeUInt16LE(0x808, 8);
    record.writeUInt16LE(33, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(0xffffffff, 20);
    record.writeUInt32LE(0xffffffff, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt16LE(28, 30);
    record.writeUInt32LE(0xffffffff, 42);
    name.copy(record, 46);
    const at = 46 + name.length;
    record.writeUInt16LE(1, at);
    record.writeUInt16LE(24, at + 2);
    record.writeBigUInt64LE(size, at + 4);
    record.writeBigUInt64LE(size, at + 12);
    record.writeBigUInt64LE(start, at + 20);
    central.push(record);
  }
  const centralOffset = offset;
  for (const record of central) {
    yield record;
    offset += BigInt(record.length);
  }
  const end = Buffer.alloc(98);
  end.writeUInt32LE(0x06064b50);
  end.writeBigUInt64LE(44n, 4);
  end.writeUInt16LE(45, 12);
  end.writeUInt16LE(45, 14);
  end.writeBigUInt64LE(BigInt(entries.length), 24);
  end.writeBigUInt64LE(BigInt(entries.length), 32);
  end.writeBigUInt64LE(offset - centralOffset, 40);
  end.writeBigUInt64LE(centralOffset, 48);
  end.writeUInt32LE(0x07064b50, 56);
  end.writeBigUInt64LE(offset, 64);
  end.writeUInt32LE(1, 72);
  end.writeUInt32LE(0x06054b50, 76);
  end.writeUInt16LE(0xffff, 84);
  end.writeUInt16LE(0xffff, 86);
  end.writeUInt32LE(0xffffffff, 88);
  end.writeUInt32LE(0xffffffff, 92);
  yield end;
}
