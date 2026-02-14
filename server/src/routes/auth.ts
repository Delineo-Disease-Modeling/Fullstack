import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { z } from "zod";
import { createSession, deleteSessionTokenCookie, generateSessionToken, setSessionTokenCookie } from "../lib/session.js";
import { authGuard } from "../middleware/auth-guard.js";

const auth_route = new Hono();

const prisma = new PrismaClient();

const loginSchema = z.object({
  email: z.string().email().nonempty(),
  password: z.string().nonempty()
});

const registerSchema = z.object({
  email: z.string().email().nonempty(),
  name: z.string().nonempty(),
  password: z.string().nonempty(),
  organization: z.string().nonempty()
});

auth_route.post('/validate-session', authGuard, async (c) => {
  return c.json({
    message: 'Session is valid'
  });
});

auth_route.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await prisma.user.findUnique({
    where: {
      email: email
    }
  });

  if (!user) {
    throw new HTTPException(401, {
      message: 'Email or password is incorrect.'
    });
  }

  let verified = false;
  try {
    verified = await verifyPassword(password, user.password_hash);
  } catch {
    verified = false;
  }

  if (!verified) {
    throw new HTTPException(401, {
      message: 'Email or password is incorrect.'
    });
  }

  // Set session-related cookies
  const sessionToken = generateSessionToken();
  await createSession(sessionToken, user.id);
  setSessionTokenCookie(c, sessionToken);

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

  const exists = await prisma.user.findUnique({
    where: { email: email }
  });

  if (exists) {
    throw new HTTPException(409, {
      message: 'A user already exists with that email'
    });
  }

  const password_hash = await hashPassword(password);

  const user = await prisma.user.create({
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
  const sessionToken = generateSessionToken();
  await createSession(sessionToken, user.id);
  setSessionTokenCookie(c, sessionToken);

  return c.json({
    message: 'Successfully registered.',
    data: {
      ...user,
      password_hash: undefined
    }
  });
});

auth_route.post('/logout', authGuard, async (c) => {
  deleteSessionTokenCookie(c);

  return c.json({
    message: 'Successfully logged out.',
  });
});

export default auth_route;
