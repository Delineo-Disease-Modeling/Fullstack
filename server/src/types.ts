import type { auth } from './lib/auth.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  }
}
