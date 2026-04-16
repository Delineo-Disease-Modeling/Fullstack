import { access, constants } from 'node:fs/promises';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { DB_FOLDER } from '@/lib/db-files';
import { prisma } from '@/lib/prisma';
import { createTarStream, type TarEntry } from '@/lib/tar';

const DEFAULT_SIM_LIMIT = 3;
const MAX_SIM_LIMIT = 20;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Diagnostic export: streams a tarball of the CZ's stored papdata+patterns plus
 * recent SimData artifacts, for offline comparison with local runs.
 *
 * Auth: any logged-in session.
 *
 * Query params:
 *   sim_id=<id>   only include this SimData run
 *   limit=<n>     include up to n most-recent runs (default 3, max 20)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json(
      { message: 'Authentication required' },
      { status: 401 }
    );
  }

  const { czone_id: rawId } = await params;
  const czone_id = Number(rawId);
  if (!Number.isFinite(czone_id) || czone_id <= 0) {
    return Response.json({ message: 'Invalid czone_id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const simIdParam = url.searchParams.get('sim_id');
  const limitParam = url.searchParams.get('limit');

  const czone = await prisma.convenienceZone.findUnique({
    where: { id: czone_id }
  });
  if (!czone) {
    return Response.json({ message: 'CZ not found' }, { status: 404 });
  }

  let simRuns: Awaited<ReturnType<typeof prisma.simData.findMany>>;
  if (simIdParam) {
    const simId = Number(simIdParam);
    if (!Number.isFinite(simId) || simId <= 0) {
      return Response.json({ message: 'Invalid sim_id' }, { status: 400 });
    }
    const single = await prisma.simData.findFirst({
      where: { id: simId, czone_id }
    });
    simRuns = single ? [single] : [];
  } else {
    const limit = limitParam
      ? Math.max(0, Math.min(MAX_SIM_LIMIT, Number(limitParam) || 0))
      : DEFAULT_SIM_LIMIT;
    simRuns = limit
      ? await prisma.simData.findMany({
          where: { czone_id },
          orderBy: { created_at: 'desc' },
          take: limit
        })
      : [];
  }

  type SimRunRow = {
    id: number;
    file_id: string;
    name: string;
    length: number;
    created_at: Date;
  };
  const manifest: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    exported_by: session.user.id,
    czone_id,
    db_folder: DB_FOLDER,
    papdata_id: czone.papdata_id,
    patterns_id: czone.patterns_id,
    files: [] as { name: string; source: string; exists: boolean }[],
    sim_runs: (simRuns as SimRunRow[]).map((r) => ({
      id: r.id,
      file_id: r.file_id,
      name: r.name,
      length: r.length,
      created_at: r.created_at
    }))
  };
  const files = manifest.files as {
    name: string;
    source: string;
    exists: boolean;
  }[];

  const entries: TarEntry[] = [
    { name: 'cz.json', content: JSON.stringify(czone, null, 2) }
  ];

  // CZ-level stored artifacts.
  if (czone.papdata_id) {
    const src = `${DB_FOLDER}${czone.papdata_id}.gz`;
    files.push({
      name: 'papdata.gz',
      source: src,
      exists: await exists(src)
    });
    entries.push({ name: 'papdata.gz', path: src });
  }
  if (czone.patterns_id) {
    const src = `${DB_FOLDER}${czone.patterns_id}.gz`;
    files.push({
      name: 'patterns.gz',
      source: src,
      exists: await exists(src)
    });
    entries.push({ name: 'patterns.gz', path: src });
  }

  // Per-run artifacts. Either .gz or plain (processor/sim both emit .gz today,
  // but /api/simdata/route.ts preserves the incoming suffix).
  for (const run of simRuns) {
    const base = `${DB_FOLDER}${run.file_id}`;
    const variants: { tarName: string; candidates: string[] }[] = [
      {
        tarName: `simdata/${run.id}/simdata.json.gz`,
        candidates: [`${base}.sim.gz`, `${base}.sim`]
      },
      {
        tarName: `simdata/${run.id}/patterns.json.gz`,
        candidates: [`${base}.pat.gz`, `${base}.pat`]
      },
      {
        tarName: `simdata/${run.id}/map.json`,
        candidates: [`${base}.map.json`]
      }
    ];

    for (const v of variants) {
      let resolved: string | null = null;
      for (const c of v.candidates) {
        if (await exists(c)) {
          resolved = c;
          break;
        }
      }
      files.push({
        name: v.tarName,
        source: resolved ?? v.candidates[0],
        exists: !!resolved
      });
      if (resolved) {
        entries.push({ name: v.tarName, path: resolved });
      }
    }

    entries.push({
      name: `simdata/${run.id}/run.json`,
      content: JSON.stringify(run, null, 2)
    });
  }

  // Manifest last so it reflects resolved paths.
  entries.unshift({
    name: 'manifest.json',
    content: JSON.stringify(manifest, null, 2)
  });

  const stream = createTarStream(entries);
  return new Response(stream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/x-tar',
      'Content-Disposition': `attachment; filename="cz-${czone_id}-export.tar"`,
      'Cache-Control': 'no-store'
    }
  });
}
