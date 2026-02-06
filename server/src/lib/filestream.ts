import { createWriteStream } from 'fs';
import { Writable } from 'stream';

export const saveFileStream = async (file: File, filePath: string) => {
  const writeStream = createWriteStream(filePath);
  await file.stream().pipeTo(Writable.toWeb(writeStream));
};
