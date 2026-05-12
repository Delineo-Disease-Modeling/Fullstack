import type { NextRequest } from 'next/server';
import { loadExperimentComparison } from '@/lib/validation-files';

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
  request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  const { experimentId } = await params;
  const datasetId = request.nextUrl.searchParams.get('dataset_id');
  const target = request.nextUrl.searchParams.get('target');

  if (!datasetId || !target) {
    return Response.json(
      { message: 'dataset_id and target are required' },
      { status: 400 }
    );
  }

  try {
    const comparison = await loadExperimentComparison(
      experimentId,
      datasetId,
      target
    );
    return Response.json({ data: comparison });
  } catch (error) {
    console.error(
      `Validation experiment comparison error (${experimentId}/${datasetId}/${target}):`,
      error
    );
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load validation comparison'
      },
      { status: errorStatus(error) }
    );
  }
}
