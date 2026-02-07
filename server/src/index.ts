import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { DB_FOLDER, PORT } from './env.js';
import { HTTPException } from 'hono/http-exception';
import { auth } from './lib/auth.js';
import { bodyLimit } from 'hono/body-limit';
import { mkdir } from 'fs/promises';

import auth_route from './routes/auth.js';
import lookup_route from './routes/lookup.js';
import cz_route from './routes/cz.js';
import patterns_route from './routes/patterns.js';
import simdata_route from './routes/simdata.js';

const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

app.use('*', trimTrailingSlash());

app.use(
  '*',
  cors({
    origin: [
      'http://localhost:5173',
      'https://coviddev.isi.jhu.edu',
      'http://coviddev.isi.jhu.edu',
      'https://covidweb.isi.jhu.edu',
      'http://covidweb.isi.jhu.edu'
    ],
    allowMethods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'Upgrade-Insecure-Requests',
      'Content-Length'
    ],
    exposeHeaders: ['Set-Cookie', 'Content-Length'],
    credentials: true
  })
);

app.use(
  '*',
  bodyLimit({
    maxSize: 20 * 1024 * 1024 * 1024
  })
);

app.use('*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    c.set('user', null);
    c.set('session', null);
    return next();
  }

  c.set('user', session.user);
  c.set('session', session.session);
  return next();
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ message: error.message }, error.status);
  }

  return c.json({ message: 'An unknown error has occurred' }, 500);
});

app.route('/', auth_route);
app.route('/', lookup_route);
app.route('/', cz_route);
app.route('/', patterns_route);
app.route('/', simdata_route);

app.get('/', async (c) => {
  return c.json({
    message: 'Hello, World!'
  });
});

await mkdir(DB_FOLDER, { recursive: true });

const port = +PORT;
serve({ fetch: app.fetch, port });
console.log(`Server is listening on port ${port}`);
