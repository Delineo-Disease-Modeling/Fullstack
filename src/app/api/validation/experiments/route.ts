import { listValidationExperiments } from '@/lib/validation-files';

export async function GET() {
  try {
    const experiments = await listValidationExperiments();
    return Response.json({ data: experiments });
  } catch (error) {
    console.error('Validation experiments list error:', error);
    return Response.json(
      { message: 'Failed to load validation experiments' },
      { status: 500 }
    );
  }
}
