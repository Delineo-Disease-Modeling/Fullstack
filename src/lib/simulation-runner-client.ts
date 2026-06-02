'use client';

import { buildSimulationRequest } from '@/lib/simulation-request';
import type { SimSettings as SimSettingsState } from '@/stores/simsettings';

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

async function readResponseMessage(response: Response) {
  try {
    const payload = await response.json();
    return (
      extractMessage(payload) ||
      `Simulation failed with status ${response.status}`
    );
  } catch {
    return (
      response.statusText || `Simulation failed with status ${response.status}`
    );
  }
}

export type ProgressUpdate = { value?: number; message?: string };

export async function runSimulation(
  settings: SimSettingsState,
  onProgress: (update: ProgressUpdate) => void
): Promise<number> {
  const request = await buildSimulationRequest(settings);
  if (request.error) {
    throw new Error(request.error);
  }
  const reqbody = request.body;

  onProgress({ value: 0, message: 'Starting simulation...' });

  const simUrl = process.env.NEXT_PUBLIC_SIM_URL;
  if (!simUrl) {
    throw new Error('NEXT_PUBLIC_SIM_URL is not configured.');
  }

  const response = await fetch(`${simUrl}simulation/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(reqbody)
  });

  if (!response.ok) {
    throw new Error(await readResponseMessage(response));
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }

        const msg = JSON.parse(line.slice(6));

        if (msg.type === 'progress') {
          const value = Number(msg.value);
          onProgress({
            value: Number.isFinite(value) ? value : 0,
            message: msg.message
          });
        } else if (msg.type === 'result') {
          const simId = Number(msg.data?.id);
          if (!Number.isFinite(simId) || simId <= 0) {
            throw new Error(
              'Simulation finished but no saved run ID was returned.'
            );
          }

          onProgress({ value: 100, message: 'Simulation complete.' });
          return simId;
        } else if (msg.type === 'error') {
          throw new Error(msg.message);
        }
      }
    }

    throw new Error('Simulation stream ended before returning a run ID.');
  }

  const json = await response.json().catch(() => null);
  const responseData =
    json && typeof json === 'object' && 'data' in json
      ? (json.data as { id?: unknown })
      : undefined;

  const simId = Number(responseData?.id);
  if (!Number.isFinite(simId) || simId <= 0) {
    throw new Error('Simulation finished but no saved run ID was returned.');
  }

  onProgress({ value: 100, message: 'Simulation complete.' });
  return simId;
}
