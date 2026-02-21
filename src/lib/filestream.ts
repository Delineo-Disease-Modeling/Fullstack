import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

export const saveFileStream = async (
  file: File,
  filePath: string,
  compress = false
) => {
  const writeStream = createWriteStream(filePath);
  const readStream = Readable.fromWeb(file.stream() as any);

  if (compress) {
    const gzip = createGzip();
    await new Promise<void>((resolve, reject) => {
      readStream
        .pipe(gzip)
        .pipe(writeStream)
        .on('finish', () => resolve())
        .on('error', reject);
    });
  } else {
    await new Promise<void>((resolve, reject) => {
      readStream
        .pipe(writeStream)
        .on('finish', () => resolve())
        .on('error', reject);
    });
  }
};
