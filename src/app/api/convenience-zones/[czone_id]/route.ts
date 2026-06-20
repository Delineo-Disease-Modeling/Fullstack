import type { NextRequest } from 'next/server';
import { jsonMessage, serviceResult } from '@/server/api/responses';
import { parseNonNegativeRouteNumber } from '@/server/api/route-params';
import { requireSessionUserId } from '@/server/api/session';
import {
  deleteConvenienceZone,
  getConvenienceZone,
  getConvenienceZoneUpdateData,
  updateConvenienceZone
} from '@/server/services/convenience-zones';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const { czone_id } = await params;
  const id = parseNonNegativeRouteNumber(czone_id, 'czone_id');
  if (!id.ok) {
    return jsonMessage(id.message, id.status);
  }

  const result = await getConvenienceZone(id.value);
  return serviceResult(result);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const { czone_id } = await params;
  const id = parseNonNegativeRouteNumber(czone_id, 'czone_id');
  if (!id.ok) {
    return jsonMessage(id.message, id.status);
  }

  const session = await requireSessionUserId(request.headers);
  if (!session.ok) {
    return session.response;
  }

  const body = await request.json();
  const data = getConvenienceZoneUpdateData(body);

  if (Object.keys(data).length === 0) {
    return jsonMessage('No valid fields to update', 400);
  }

  const result = await updateConvenienceZone(id.value, session.userId, data);
  return serviceResult(result);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const { czone_id } = await params;
  const id = parseNonNegativeRouteNumber(czone_id, 'czone_id');
  if (!id.ok) {
    return jsonMessage(id.message, id.status);
  }

  const session = await requireSessionUserId(request.headers);
  if (!session.ok) {
    return session.response;
  }

  const result = await deleteConvenienceZone(id.value, session.userId);
  return serviceResult(result);
}
