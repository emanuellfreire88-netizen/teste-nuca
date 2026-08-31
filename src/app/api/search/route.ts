import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';
import { ciContains } from '@/lib/search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/search?q=query
 *
 * Global search across students, schools, events, documents, tasks, and alerts.
 * Respects user permissions (school scoping).
 * Returns minimal data — no sensitive fields (CPF, phone, address).
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();

    if (q.length < 2) {
      return NextResponse.json({ results: [], message: 'Digite pelo menos 2 caracteres' });
    }

    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const allowedSchoolIds = await getUserSchoolIds(userId, userRole);

    const results: Array<{
      type: string;
      id: string;
      title: string;
      subtitle?: string;
      url: string;
    }> = [];

    // 1. Search students (respect school scoping)
    const studentWhere: Record<string, unknown> = {
      status: 'active',
      full_name: ciContains(q),
    };
    if (allowedSchoolIds !== null) {
      studentWhere.school_id = { in: allowedSchoolIds };
    }

    const students = await db.student.findMany({
      where: studentWhere,
      select: {
        id: true, full_name: true,
        school: { select: { name: true } },
      },
      take: 10,
    });

    for (const s of students) {
      results.push({
        type: 'student',
        id: s.id,
        title: s.full_name,
        subtitle: s.school?.name,
        url: 'students',
      });
    }

    // 2. Search schools (admin sees all, operator sees assigned)
    const schoolWhere: Record<string, unknown> = {};
    if (allowedSchoolIds !== null) {
      schoolWhere.id = { in: allowedSchoolIds };
    }
    schoolWhere.name = ciContains(q);

    const schools = await db.school.findMany({
      where: schoolWhere,
      select: { id: true, name: true },
      take: 5,
    });

    for (const s of schools) {
      results.push({
        type: 'school',
        id: s.id,
        title: s.name,
        url: 'schools',
      });
    }

    // 3. Search events
    const events = await db.event.findMany({
      where: {
        OR: [
          { title: ciContains(q) },
          { description: ciContains(q) },
        ],
      },
      select: { id: true, title: true, date: true },
      take: 10,
    });

    for (const e of events) {
      results.push({
        type: 'event',
        id: e.id,
        title: e.title,
        subtitle: new Date(e.date).toLocaleDateString('pt-BR'),
        url: 'events',
      });
    }

    // 4. Search documents
    const documents = await db.docManagementDocument.findMany({
      where: {
        OR: [
          { number_formatted: ciContains(q) },
          { subject: ciContains(q) },
          { recipient: ciContains(q) },
          { protocol: ciContains(q) },
        ],
      },
      select: { id: true, number_formatted: true, subject: true, status: true },
      take: 10,
    });

    for (const d of documents) {
      results.push({
        type: 'document',
        id: d.id,
        title: d.number_formatted || d.subject || 'Documento',
        subtitle: d.subject || '',
        url: 'document-management',
      });
    }

    // 5. Search tasks (user sees own tasks, admin sees all)
    const taskWhere: Record<string, unknown> = {};
    if (userRole !== 'Admin') {
      taskWhere.OR = [{ assigned_to: userId }, { created_by: userId }];
    }
    taskWhere.title = ciContains(q);

    const tasks = await db.task.findMany({
      where: taskWhere,
      select: { id: true, title: true, status: true },
      take: 10,
    });

    for (const t of tasks) {
      results.push({
        type: 'task',
        id: t.id,
        title: t.title,
        subtitle: t.status,
        url: 'tasks',
      });
    }

    // 6. Search dropout alerts (students at risk)
    const dropoutStudents = await db.dropoutRiskAssessment.findMany({
      where: {
        student: {
          status: 'active',
          full_name: ciContains(q),
          ...(allowedSchoolIds !== null ? { school_id: { in: allowedSchoolIds } } : {}),
        },
        risk_level: { in: ['medium', 'high'] },
      },
      include: {
        student: { select: { id: true, full_name: true } },
      },
      take: 5,
      orderBy: { calculated_at: 'desc' },
    });

    const seenDropout = new Set<string>();
    for (const d of dropoutStudents) {
      if (seenDropout.has(d.student_id)) continue;
      seenDropout.add(d.student_id);
      results.push({
        type: 'dropout_alert',
        id: d.id,
        title: d.student.full_name,
        subtitle: `Risco ${d.risk_level}`,
        url: 'dropout',
      });
    }

    // Limit total results
    const limitedResults = results.slice(0, 30);

    return NextResponse.json({
      results: limitedResults,
      total: results.length,
    });
  } catch (error) {
    console.error('Global search error:', error);
    return NextResponse.json({ error: 'Erro na busca' }, { status: 500 });
  }
});
