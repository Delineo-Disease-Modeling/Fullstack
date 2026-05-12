import { listValidationDatasets } from '@/lib/validation-files';

export async function GET() {
  try {
    const datasets = await listValidationDatasets();
    return Response.json({ data: datasets });
  } catch (error) {
    console.error('Validation datasets list error:', error);
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load validation datasets'
      },
      { status: 500 }
    );
  }
}
