import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { createGzip } from 'zlib';

export const saveFileStream = async (
  file: File,
  filePath: string,
  compress = false
) => {
  const writeStream = createWriteStream(filePath);
  const readStream = Readable.fromWeb(file.stream() as any); // Cast to any to avoid type mismatch with DOM streams if needed

  if (compress) {
    const gzip = createGzip();
    await new Promise((resolve, reject) => {
      readStream
        .pipe(gzip)
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });
  } else {
    await new Promise((resolve, reject) => {
      readStream.pipe(writeStream).on('finish', resolve).on('error', reject);
    });
  }
};
