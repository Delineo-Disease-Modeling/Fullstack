import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { loginSchema, registerSchema } from "../schemas.js";
import { HTTPException } from "hono/http-exception";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { useFormStatus } from "hono/jsx/dom";

const auth_route = new Hono();

const prisma = new PrismaClient();

auth_route.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await prisma.user.findFirst({
    where: {
      email: email
    }
  });

  if (!user) {
    throw new HTTPException(404, {
      message: 'User not found'
    });
  }

  const verified = await verifyPassword(password, user.password_hash);

  if (!verified) {
    throw new HTTPException(401, {
      message: 'Unauthorized'
    });
  }

  // Set session-related cookies
  // const sessionToken = generateSessionToken();
  // const session = await createSession(sessionToken, user.id);
  // setSessionTokenCookie(c, sessionToken, session.expiresAt);

  return c.json({
    message: 'Successfully logged in.',
    data: {
      ...user,
      password_hash: undefined
    }
  });
});

auth_route.post('/register', zValidator('json', registerSchema), async (c) => {
  const { name, email, password, organization } = c.req.valid('json');

  const password_hash = await hashPassword(password);

  const user = prisma.user.create({
    data: {
      name,
      email,
      password_hash,
      organization
    }
  });

  if (!user) {
    throw new HTTPException(400, { message: 'Could not create/update user' });
  }

  // Set session-related cookies
  // const sessionToken = generateSessionToken();
  // const session = await createSession(sessionToken, user.id);
  // setSessionTokenCookie(c, sessionToken, session.expiresAt);

  return c.json({
    message: 'Successfully registered.',
    data: {
      ...user,
      password_hash: undefined
    }
  });
});

export default auth_route;
