import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import Chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import type { JsonObjectEntry } from './simulation-data';

type JsonStreamItem =
  | ReturnType<typeof createReadStream>
  | ReturnType<typeof createGunzip>
  | ReturnType<typeof parser>
  | ReturnType<typeof StreamObject.streamObject>;
type StreamChainInput = Parameters<typeof Chain.chain>[0];

export function streamJsonObjectEntries<T>(
  filePath: string,
  gzipped: boolean
): AsyncIterableIterator<JsonObjectEntry<T>> {
  const streamChain: JsonStreamItem[] = [createReadStream(filePath)];
  if (gzipped) {
    streamChain.push(createGunzip());
  }
  streamChain.push(parser(), StreamObject.streamObject());

  return Chain.chain(streamChain as unknown as StreamChainInput)[
    Symbol.asyncIterator
  ]() as AsyncIterableIterator<JsonObjectEntry<T>>;
}
