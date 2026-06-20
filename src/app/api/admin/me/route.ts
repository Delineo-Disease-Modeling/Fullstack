import type { NextRequest } from 'next/server';
import { isAdminSession } from '@/server/api/session';

// Reports whether the current session is an admin, so the client can show
// admin-only controls (e.g. delete-run buttons). Enforcement still happens on
// each protected endpoint — this is UX only.
export async function GET(request: NextRequest) {
  const isAdmin = await isAdminSession(request.headers);
  return Response.json({ data: { isAdmin } });
}
