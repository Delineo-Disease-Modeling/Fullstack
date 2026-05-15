export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; status: number };

export function jsonData<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

export function jsonMessage(message: string, status: number): Response {
  return Response.json({ message }, { status });
}

export function badRequest(message: string): Response {
  return jsonMessage(message, 400);
}

export function unauthorized(
  message = 'Authentication required'
): Response {
  return jsonMessage(message, 401);
}

export function forbidden(message = 'Forbidden'): Response {
  return jsonMessage(message, 403);
}

export function notFound(message: string): Response {
  return jsonMessage(message, 404);
}

export function serviceResult<T>(result: ServiceResult<T>): Response {
  if (result.ok) {
    return jsonData(result.data);
  }

  return jsonMessage(result.message, result.status);
}
