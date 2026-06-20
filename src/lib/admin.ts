// Accounts allowed to delete any run/zone regardless of ownership.
// Configured via the DELINEO_ADMIN_EMAILS env var (comma-separated), e.g.
//   DELINEO_ADMIN_EMAILS=rtaleb1@alumni.jh.edu
// Server-side only — the list is never sent to the client. The client learns
// whether the current session is an admin via GET /api/admin/me.

export function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.DELINEO_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getAdminEmails().has(email.toLowerCase());
}
