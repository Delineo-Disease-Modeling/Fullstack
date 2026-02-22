import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '@/generated/prisma/client';

const pool = new pg.Pool({
  connectionString: process.env.PRISMA_DB_URL,
  ssl: false
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
