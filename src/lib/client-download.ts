'use client';

function extractMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const message = record.message;
  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  const error = record.error;
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return null;
}

async function readDownloadError(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.toLowerCase().includes('application/json')) {
    const payload = await response.json().catch(() => null);
    const message = extractMessage(payload);
    if (message) {
      return message;
    }
  } else {
    const message = await response.text().catch(() => '');
    if (message.trim()) {
      return message.trim();
    }
  }

  return response.statusText || `Request failed with status ${response.status}`;
}

function getFilenameFromDisposition(
  disposition: string | null,
  fallbackFilename: string
) {
  if (!disposition) {
    return fallbackFilename;
  }

  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    return decodeURIComponent(encodedMatch[1]);
  }

  const simpleMatch = disposition.match(/filename="?([^";]+)"?/i);
  return simpleMatch?.[1] || fallbackFilename;
}

export async function downloadApiFile(url: string, fallbackFilename: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(await readDownloadError(response));
  }

  const blob = await response.blob();
  const filename = getFilenameFromDisposition(
    response.headers.get('content-disposition'),
    fallbackFilename
  );

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
