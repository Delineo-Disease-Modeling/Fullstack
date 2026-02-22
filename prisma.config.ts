import type { PrismaConfig } from 'prisma';
import { config } from 'dotenv';
import { resolve } from 'path';

// Prisma 7 doesn't auto-load env vars; load .env for CLI operations
config({ path: resolve(process.cwd(), '.env') });

const dbUrl = process.env.PRISMA_DB_URL ?? '';

export default {
  schema: './prisma/schema.prisma',
  datasource: {
    url: dbUrl
  }
} satisfies PrismaConfig;
