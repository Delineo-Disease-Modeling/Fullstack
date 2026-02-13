import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";

const reports_route = new Hono();
const prisma = new PrismaClient();

// Schema for creating a new report
const createReportSchema = z.object({
  run_type: z.enum(["cz_generation", "simulation"]),
  name: z.string(),
  started_at: z.string().datetime(),
  czone_id: z.number().optional(),
  sim_id: z.number().optional(),
  user_id: z.string().optional(),
  parameters: z.record(z.any()).optional(),
});

// Schema for updating a report
const updateReportSchema = z.object({
  status: z.enum(["running", "completed", "failed"]).optional(),
  completed_at: z.string().datetime().optional(),
  duration_ms: z.number().optional(),
  summary: z.record(z.any()).optional(),
  logs: z.array(z.object({
    timestamp: z.string(),
    level: z.enum(["info", "warn", "error", "debug"]),
    message: z.string(),
  })).optional(),
  error: z.string().optional(),
});

// Schema for appending logs
const appendLogsSchema = z.object({
  logs: z.array(z.object({
    timestamp: z.string(),
    level: z.enum(["info", "warn", "error", "debug"]),
    message: z.string(),
  })),
});

// GET /reports - List all reports
reports_route.get('/reports', async (c) => {
  const { user_id, run_type, limit } = c.req.query();
  
  const reports = await prisma.runReport.findMany({
    where: {
      ...(user_id && { user_id }),
      ...(run_type && { run_type }),
    },
    orderBy: { created_at: 'desc' },
    take: limit ? parseInt(limit) : 50,
  });

  // Parse JSON fields for response
  return c.json({
    data: reports.map((r) => ({
      ...r,
      parameters: r.parameters ? JSON.parse(r.parameters) : null,
      summary: r.summary ? JSON.parse(r.summary) : null,
      logs: r.logs ? JSON.parse(r.logs) : [],
    })),
  });
});

// GET /reports/:id - Get single report
reports_route.get('/reports/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  
  const report = await prisma.runReport.findUnique({
    where: { id },
  });

  if (!report) {
    return c.json({ message: 'Report not found' }, 404);
  }

  return c.json({
    data: {
      ...report,
      parameters: report.parameters ? JSON.parse(report.parameters) : null,
      summary: report.summary ? JSON.parse(report.summary) : null,
      logs: report.logs ? JSON.parse(report.logs) : [],
    },
  });
});

// POST /reports - Create new report (called when run starts)
reports_route.post('/reports', zValidator('json', createReportSchema), async (c) => {
  const data = c.req.valid('json');

  const report = await prisma.runReport.create({
    data: {
      run_type: data.run_type,
      status: 'running',
      name: data.name,
      started_at: new Date(data.started_at),
      czone_id: data.czone_id,
      sim_id: data.sim_id,
      user_id: data.user_id,
      parameters: data.parameters ? JSON.stringify(data.parameters) : null,
      logs: '[]',
    },
  });

  return c.json({ data: report });
});

// PATCH /reports/:id - Update report (called when run completes or fails)
reports_route.patch(
  '/reports/:id',
  zValidator('json', updateReportSchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const data = c.req.valid('json');

    const existing = await prisma.runReport.findUnique({ where: { id } });
    if (!existing) {
      return c.json({ message: 'Report not found' }, 404);
    }

    // Handle logs - merge with existing
    let logsJson = existing.logs || '[]';
    if (data.logs) {
      const existingLogs = JSON.parse(logsJson);
      logsJson = JSON.stringify([...existingLogs, ...data.logs]);
    }

    const report = await prisma.runReport.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.completed_at && { completed_at: new Date(data.completed_at) }),
        ...(data.duration_ms !== undefined && { duration_ms: data.duration_ms }),
        ...(data.summary && { summary: JSON.stringify(data.summary) }),
        ...(data.logs && { logs: logsJson }),
        ...(data.error && { error: data.error }),
      },
    });

    return c.json({ data: report });
  }
);

// POST /reports/:id/logs - Append logs to existing report (for streaming updates)
reports_route.post(
  '/reports/:id/logs',
  zValidator('json', appendLogsSchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    const { logs: newLogs } = c.req.valid('json');

    const existing = await prisma.runReport.findUnique({ where: { id } });
    if (!existing) {
      return c.json({ message: 'Report not found' }, 404);
    }

    const existingLogs = JSON.parse(existing.logs || '[]');
    const mergedLogs = [...existingLogs, ...newLogs];

    await prisma.runReport.update({
      where: { id },
      data: { logs: JSON.stringify(mergedLogs) },
    });

    return c.json({ success: true, log_count: mergedLogs.length });
  }
);

// DELETE /reports/:id - Delete a report
reports_route.delete('/reports/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    await prisma.runReport.delete({ where: { id } });
    return c.json({ success: true });
  } catch {
    return c.json({ message: 'Report not found' }, 404);
  }
});

export default reports_route;
