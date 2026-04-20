import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { createGzip } from 'node:zlib';

export const saveFileStream = async (
  file: File,
  filePath: string,
  compress = false
) => {
  const tempPath = `${filePath}.tmp-${randomUUID()}`;
  const readStream = Readable.fromWeb(
    file.stream() as unknown as NodeReadableStream
  );
  const writeStream = createWriteStream(tempPath);

  try {
    if (compress) {
      await pipeline(readStream, createGzip(), writeStream);
    } else {
      await pipeline(readStream, writeStream);
    }

    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
};
