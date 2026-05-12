import type { NextRequest } from 'next/server';
import { loadValidationDatasetObserved } from '@/lib/validation-files';

function errorStatus(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  const message = error instanceof Error ? error.message : '';

  if (code === 'ENOENT' || message.includes('was not found')) {
    return 404;
  }
  if (
    message.startsWith('Invalid ') ||
    message.includes('exists in multiple')
  ) {
    return 400;
  }
  return 500;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  const { datasetId } = await params;
  const target = request.nextUrl.searchParams.get('target');

  if (!target) {
    return Response.json({ message: 'target is required' }, { status: 400 });
  }

  try {
    const observed = await loadValidationDatasetObserved(datasetId, target);
    return Response.json({ data: observed });
  } catch (error) {
    console.error(
      `Validation observed data error (${datasetId}/${target}):`,
      error
    );
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load validation observed data'
      },
      { status: errorStatus(error) }
    );
  }
}
