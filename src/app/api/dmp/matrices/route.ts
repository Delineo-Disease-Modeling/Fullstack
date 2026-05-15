import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const TWO_MB = 2 * 1024 * 1024;

const postSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  content: z.string().min(1)
});

function validateMatrixCsv(content: string): string | null {
  if (content.length > TWO_MB) {
    return 'Matrix file exceeds the 2 MB size limit.';
  }

  const dataLines = content.split('\n').filter((line) => {
    const t = line.trim();
    return t && !t.startsWith('#');
  });

  if (dataLines.length === 0) {
    return 'CSV file has no data rows.';
  }

  const numStates = dataLines[0].split(',').map((v) => v.trim()).filter(Boolean).length;
  if (numStates < 2) {
    return `First data row has only ${numStates} column(s); expected at least 2 states.`;
  }

  for (let i = 0; i < dataLines.length; i++) {
    const values = dataLines[i].split(',').map((v) => v.trim()).filter(Boolean);
    if (values.length !== numStates) {
      return `Row ${i + 1} has ${values.length} column(s) but expected ${numStates}.`;
    }
    for (const val of values) {
      if (isNaN(Number(val))) {
        return `Row ${i + 1} contains a non-numeric value: "${val}".`;
      }
    }
  }

  const blockSize = 6 * numStates;
  if (dataLines.length % blockSize !== 0) {
    return `Invalid structure: ${dataLines.length} data rows found, but expected a multiple of ${blockSize} (6 sub-matrices × ${numStates} states per demographic block).`;
  }

  return null;
}

function getDefaultMatrixContent(): string {
  const filePath = join(process.cwd(), 'public', 'data', 'matrices', 'combined_default.csv');
  return readFileSync(filePath, 'utf8');
}

async function ensureDefaultMatrix() {
  const existing = await prisma.dmpMatrix.findFirst({ where: { is_default: true } });
  if (existing) return;
  await prisma.dmpMatrix.create({
    data: {
      name: 'Default Delta/Omicron Matrix',
      description:
        'Built-in combined transition matrices for Delta and Omicron variants across all demographic groups.',
      content: getDefaultMatrixContent(),
      is_default: true,
      user_id: null
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    await ensureDefaultMatrix();

    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id ?? null;

    const matrices = await prisma.dmpMatrix.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        is_default: true,
        created_at: true,
        user_id: true,
        user: { select: { name: true } }
      },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }]
    });

    return Response.json({
      data: matrices.map((m) => ({
        ...m,
        is_owner: userId !== null && m.user_id === userId
      }))
    });
  } catch {
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return Response.json({ message: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ message: parsed.error.message }, { status: 400 });
    }

    const { name, description, content } = parsed.data;

    const csvError = validateMatrixCsv(content);
    if (csvError) {
      return Response.json({ message: csvError }, { status: 422 });
    }

    const matrix = await prisma.dmpMatrix.create({
      data: { name, description, content, user_id: session.user.id }
    });

    return Response.json(
      {
        data: {
          id: matrix.id,
          name: matrix.name,
          description: matrix.description,
          is_default: matrix.is_default,
          created_at: matrix.created_at,
          user_id: matrix.user_id,
          is_owner: true
        }
      },
      { status: 201 }
    );
  } catch {
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
