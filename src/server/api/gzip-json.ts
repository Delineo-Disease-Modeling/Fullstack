import { gunzipSync, gzipSync } from 'node:zlib';

// Min payload worth gzipping (below this the CPU/overhead isn't worth it).
const GZIP_MIN_BYTES = 1024;

// A Node Buffer/Uint8Array is a valid Response body at runtime (undici), but TS
// 5.9's generic `Uint8Array<ArrayBufferLike>` doesn't match the DOM `BodyInit`
// union. Expose a zero-copy view cast to BodyInit (same approach the export
// routes use for their streams).
function asBody(buf: Buffer): BodyInit {
  return new Uint8Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength
  ) as unknown as BodyInit;
}

/**
 * JSON response that is gzip-compressed when the client accepts it and the
 * payload is large enough. The prod TLS proxy does not compress API JSON, so
 * the Cases-map payloads (hundreds of KB / several MB) ship uncompressed and
 * choke playback over the WAN — we compress at the app layer instead. Mirrors
 * `jsonData` (wraps the value in `{ data }`).
 */
export function gzipJsonData(
  request: Request,
  data: unknown,
  extraHeaders: Record<string, string> = {}
): Response {
  return gzipJson(request, { data }, extraHeaders);
}

/** Like `gzipJsonData` but sends the value as-is (no `{ data }` envelope). */
export function gzipJson(
  request: Request,
  payload: unknown,
  extraHeaders: Record<string, string> = {}
): Response {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const acceptsGzip = (request.headers.get('accept-encoding') ?? '').includes(
    'gzip'
  );

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Vary: 'Accept-Encoding',
    ...extraHeaders
  };

  if (!acceptsGzip || body.byteLength < GZIP_MIN_BYTES) {
    return new Response(asBody(body), { headers });
  }

  const gz = gzipSync(body);
  headers['Content-Encoding'] = 'gzip';
  return new Response(asBody(gz), { headers });
}

/**
 * Serve a pre-gzipped JSON buffer (lets callers cache the gz bytes). Honors
 * `Accept-Encoding`: a client that doesn't accept gzip gets the decompressed
 * body instead.
 */
export function gzipPreserialized(
  request: Request,
  gz: Buffer,
  extraHeaders: Record<string, string> = {}
): Response {
  const acceptsGzip = (request.headers.get('accept-encoding') ?? '').includes(
    'gzip'
  );
  if (!acceptsGzip) {
    return new Response(asBody(gunzipSync(gz)), {
      headers: {
        'Content-Type': 'application/json',
        Vary: 'Accept-Encoding',
        ...extraHeaders
      }
    });
  }
  return new Response(asBody(gz), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      Vary: 'Accept-Encoding',
      ...extraHeaders
    }
  });
}
