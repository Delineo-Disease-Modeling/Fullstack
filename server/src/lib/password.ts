import { hash, verify } from '@node-rs/argon2';

export async function hashPassword(password: string) {
  return await hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    outputLen: 32,
    parallelism: 4
  });
}

export async function verifyPassword(password: string, hash: string) {
  return await verify(hash, password);
}
