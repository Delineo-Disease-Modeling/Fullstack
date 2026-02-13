import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { DB_FOLDER, PORT } from './env.js';
import { HTTPException } from 'hono/http-exception';
import { auth } from './middleware/auth.js';
import { bodyLimit } from 'hono/body-limit';
import { mkdir } from 'fs/promises';

import auth_route from './routes/auth.js';
import lookup_route from './routes/lookup.js';
import cz_route from './routes/cz.js';
import patterns_route from './routes/patterns.js';
import simdata_route from './routes/simdata.js';
import reports_route from './routes/reports.js';

const app = new Hono();

app.use('*', trimTrailingSlash());
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://coviddev.isi.jhu.edu',
      'http://coviddev.isi.jhu.edu',
      'https://covidweb.isi.jhu.edu',
      'http://covidweb.isi.jhu.edu'
    ],
    allowMethods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Upgrade-Insecure-Requests', 'Content-Length'],
    exposeHeaders: ['Set-Cookie', 'Content-Length'],
    credentials: true
  })
);
app.use('*', auth);
app.use('*', bodyLimit({
  maxSize: 20 * 1024 * 1024 * 1024
}));

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ message: error.message }, error.status);
  }

  console.error('Unhandled error:', error);
  return c.json({ message: 'An unknown error has occurred' }, 500);
});

app.route('/auth', auth_route);
app.route('/', lookup_route);
app.route('/', cz_route);
app.route('/', patterns_route);
app.route('/', simdata_route);
app.route('/', reports_route);

app.get('/', async (c) => {
  return c.json({
    message: 'Hello, World!'
  });
});

await mkdir(DB_FOLDER, { recursive: true });

const port = +PORT;
serve({ fetch: app.fetch, port });
console.log(`Server is listening on port ${port}`);
