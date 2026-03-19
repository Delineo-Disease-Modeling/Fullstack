export type ZoneEvent = {
  type: 'zone-created' | 'zone-ready' | 'zone-updated' | 'zone-deleted';
  zone_id: number;
};

const clients = new Set<ReadableStreamDefaultController>();

const encoder = new TextEncoder();

export function addClient(controller: ReadableStreamDefaultController) {
  clients.add(controller);
}

export function removeClient(controller: ReadableStreamDefaultController) {
  clients.delete(controller);
}

export function broadcast(event: ZoneEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = encoder.encode(data);
  for (const controller of clients) {
    try {
      controller.enqueue(encoded);
    } catch {
      clients.delete(controller);
    }
  }
}
