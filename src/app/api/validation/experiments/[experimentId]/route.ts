import type { NextRequest } from 'next/server';
import { loadExperimentDetail } from '@/lib/validation-files';

function errorStatus(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  const message = error instanceof Error ? error.message : '';

  if (code === 'ENOENT' || message.includes('was not found')) {
    return 404;
  }
  if (message.startsWith('Invalid ')) {
    return 400;
  }
  return 500;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  const { experimentId } = await params;

  try {
    const detail = await loadExperimentDetail(experimentId);
    return Response.json({ data: detail });
  } catch (error) {
    console.error(`Validation experiment detail error (${experimentId}):`, error);
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load validation experiment'
      },
      { status: errorStatus(error) }
    );
  }
}
