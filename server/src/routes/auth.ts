import { Hono } from 'hono';
import { auth } from '../lib/auth.js';

const auth_route = new Hono();

auth_route.on(['POST', 'GET'], '/api/auth/*', (c) => {
	return auth.handler(c.req.raw);
});

export default auth_route;
