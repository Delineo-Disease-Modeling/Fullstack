import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

const BLOCK = 512;

function writeOctal(buf: Uint8Array, offset: number, width: number, n: number) {
  // width includes a trailing NUL; numeric field is (width-1) octal digits.
  const s = n.toString(8).padStart(width - 1, '0');
  for (let i = 0; i < width - 1; i++) buf[offset + i] = s.charCodeAt(i);
  buf[offset + width - 1] = 0;
}

function writeString(
  buf: Uint8Array,
  offset: number,
  width: number,
  s: string
) {
  const bytes = new TextEncoder().encode(s);
  if (bytes.length > width) {
    throw new Error(`tar: field too long (${bytes.length} > ${width}): ${s}`);
  }
  for (let i = 0; i < bytes.length; i++) buf[offset + i] = bytes[i];
}

function buildHeader(name: string, size: number, mtime: number): Uint8Array {
  if (new TextEncoder().encode(name).length > 100) {
    throw new Error(`tar: name too long: ${name}`);
  }
  const h = new Uint8Array(BLOCK);
  writeString(h, 0, 100, name);
  writeOctal(h, 100, 8, 0o644); // mode
  writeOctal(h, 108, 8, 0); // uid
  writeOctal(h, 116, 8, 0); // gid
  writeOctal(h, 124, 12, size); // size
  writeOctal(h, 136, 12, Math.floor(mtime)); // mtime
  // checksum: fill with spaces first
  for (let i = 148; i < 156; i++) h[i] = 0x20;
  h[156] = 0x30; // typeflag '0' (regular)
  writeString(h, 257, 6, 'ustar'); // magic (5 chars + NUL)
  writeString(h, 263, 2, '00'); // version

  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += h[i];
  const cs = sum.toString(8).padStart(6, '0');
  for (let i = 0; i < 6; i++) h[148 + i] = cs.charCodeAt(i);
  h[154] = 0;
  h[155] = 0x20;
  return h;
}

export interface TarEntry {
  name: string;
  /** Absolute or relative filesystem path to stream into the tarball. */
  path?: string;
  /** In-memory contents. Either `path` or `content` must be provided. */
  content?: Uint8Array | string;
}

/**
 * Streams a POSIX USTAR tarball of the given entries. Missing on-disk files
 * (ENOENT) are silently skipped.
 */
export function createTarStream(entries: TarEntry[]): ReadableStream<Uint8Array> {
  const now = Math.floor(Date.now() / 1000);
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const entry of entries) {
          if (entry.content !== undefined) {
            const body =
              typeof entry.content === 'string'
                ? new TextEncoder().encode(entry.content)
                : entry.content;
            controller.enqueue(buildHeader(entry.name, body.length, now));
            controller.enqueue(body);
            const pad = (BLOCK - (body.length % BLOCK)) % BLOCK;
            if (pad) controller.enqueue(new Uint8Array(pad));
            continue;
          }

          if (!entry.path) continue;

          let size: number;
          let mtime: number;
          try {
            const st = await stat(entry.path);
            size = st.size;
            mtime = Math.floor(st.mtimeMs / 1000);
          } catch (e: unknown) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw e;
          }

          controller.enqueue(buildHeader(entry.name, size, mtime));
          let written = 0;
          for await (const chunk of createReadStream(entry.path)) {
            const buf =
              typeof chunk === 'string'
                ? new TextEncoder().encode(chunk)
                : new Uint8Array(
                    chunk.buffer,
                    chunk.byteOffset,
                    chunk.byteLength
                  );
            controller.enqueue(buf);
            written += buf.length;
          }
          if (written !== size) {
            throw new Error(
              `tar: size mismatch for ${entry.name}: header ${size}, wrote ${written}`
            );
          }
          const pad = (BLOCK - (size % BLOCK)) % BLOCK;
          if (pad) controller.enqueue(new Uint8Array(pad));
        }

        // End-of-archive: two zero blocks.
        controller.enqueue(new Uint8Array(BLOCK * 2));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    }
  });
}
