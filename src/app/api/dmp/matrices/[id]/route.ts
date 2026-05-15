import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const TWO_MB = 2 * 1024 * 1024;

function validateMatrixCsv(content: string): string | null {
  if (content.length > TWO_MB) return 'Matrix file exceeds the 2 MB size limit.';

  const dataLines = content.split('\n').filter((line) => {
    const t = line.trim();
    return t && !t.startsWith('#');
  });

  if (dataLines.length === 0) return 'CSV file has no data rows.';

  const numStates = dataLines[0].split(',').map((v) => v.trim()).filter(Boolean).length;
  if (numStates < 2) return `First data row has only ${numStates} column(s); expected at least 2 states.`;

  for (let i = 0; i < dataLines.length; i++) {
    const values = dataLines[i].split(',').map((v) => v.trim()).filter(Boolean);
    if (values.length !== numStates) return `Row ${i + 1} has ${values.length} column(s) but expected ${numStates}.`;
    for (const val of values) {
      if (isNaN(Number(val))) return `Row ${i + 1} contains a non-numeric value: "${val}".`;
    }
  }

  const blockSize = 6 * numStates;
  if (dataLines.length % blockSize !== 0) {
    return `Invalid structure: ${dataLines.length} data rows found, but expected a multiple of ${blockSize} (6 sub-matrices × ${numStates} states per demographic block).`;
  }
  return null;
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional()
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const matrixId = Number(id);
    if (!Number.isFinite(matrixId)) {
      return Response.json({ message: 'Invalid matrix ID.' }, { status: 400 });
    }

    const matrix = await prisma.dmpMatrix.findUnique({
      where: { id: matrixId },
      include: { user: { select: { name: true } } }
    });

    if (!matrix) {
      return Response.json({ message: 'Matrix not found.' }, { status: 404 });
    }

    return Response.json({ data: matrix });
  } catch {
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return Response.json({ message: 'Authentication required.' }, { status: 401 });
    }

    const { id } = await params;
    const matrixId = Number(id);
    if (!Number.isFinite(matrixId)) {
      return Response.json({ message: 'Invalid matrix ID.' }, { status: 400 });
    }

    const matrix = await prisma.dmpMatrix.findUnique({ where: { id: matrixId } });
    if (!matrix) {
      return Response.json({ message: 'Matrix not found.' }, { status: 404 });
    }
    if (matrix.is_default) {
      return Response.json({ message: 'Built-in matrices cannot be edited.' }, { status: 403 });
    }
    if (matrix.user_id !== session.user.id) {
      return Response.json({ message: 'Only the owner can edit this matrix.' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ message: parsed.error.message }, { status: 400 });
    }

    if (parsed.data.content) {
      const csvError = validateMatrixCsv(parsed.data.content);
      if (csvError) {
        return Response.json({ message: csvError }, { status: 422 });
      }
    }

    const updated = await prisma.dmpMatrix.update({
      where: { id: matrixId },
      data: parsed.data
    });

    return Response.json({ data: updated });
  } catch {
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return Response.json({ message: 'Authentication required.' }, { status: 401 });
    }

    const { id } = await params;
    const matrixId = Number(id);
    if (!Number.isFinite(matrixId)) {
      return Response.json({ message: 'Invalid matrix ID.' }, { status: 400 });
    }

    const matrix = await prisma.dmpMatrix.findUnique({ where: { id: matrixId } });
    if (!matrix) {
      return Response.json({ message: 'Matrix not found.' }, { status: 404 });
    }
    if (matrix.is_default) {
      return Response.json({ message: 'Built-in matrices cannot be deleted.' }, { status: 403 });
    }
    if (matrix.user_id !== session.user.id) {
      return Response.json({ message: 'Only the owner can delete this matrix.' }, { status: 403 });
    }

    await prisma.dmpMatrix.delete({ where: { id: matrixId } });

    return Response.json({ data: { id: matrixId } });
  } catch {
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
