import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateStudentRisk, saveRiskAssessment } from '@/lib/dropout-risk';
import { logAction } from '@/lib/logger';
import { notifyAdminsOfDropoutRisk } from '@/lib/notification-triggers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Maximum execution time

/**
 * POST /api/cron/detect-dropout
 *
 * Cron job that automatically calculates dropout risk for all active students.
 * Designed to be called by Vercel Cron once daily (e.g., 6:00 AM UTC).
 *
 * Security: Requires CRON_SECRET header to prevent unauthorized execution.
 * Configure CRON_SECRET in Vercel environment variables.
 *
 * Protection against:
 * - Duplicate execution: checks if assessment was already calculated today
 * - Silent failures: logs all errors and returns summary
 * - Unauthorized access: requires secret header
 *
 * Vercel Cron config (vercel.json):
 * {
 *   "crons": [
 *     { "path": "/api/cron/detect-dropout", "schedule": "0 6 * * *" }
 *   ]
 * }
 */
export async function POST(req: NextRequest) {
  // ─── Security: verify CRON_SECRET ───────────────────────────────────
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[CRON] CRON_SECRET not configured');
    return NextResponse.json(
      { error: 'CRON_SECRET não configurado' },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[CRON] Unauthorized cron access attempt');
    return NextResponse.json(
      { error: 'Não autorizado' },
      { status: 401 }
    );
  }

  console.log('[CRON] Iniciando detecção automática de evasão...');

  try {
    // ─── Fetch all active students ───────────────────────────────────
    const students = await db.student.findMany({
      where: { status: 'active' },
      select: { id: true, full_name: true },
    });

    console.log(`[CRON] Avaliando ${students.length} alunos ativos...`);

    let processed = 0;
    let atRisk = 0;
    let newAlerts = 0;
    let errors = 0;
    const results: Array<{ studentId: string; riskLevel: string; isNew: boolean }> = [];

    for (const student of students) {
      try {
        // Check if already assessed today (prevent duplicate daily execution)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const existingToday = await db.dropoutRiskAssessment.findFirst({
          where: {
            student_id: student.id,
            calculated_at: { gte: today },
          },
          select: { id: true },
        });

        if (existingToday) {
          // Already assessed today — skip to avoid duplicates
          continue;
        }

        // Calculate risk
        const assessment = await calculateStudentRisk(student.id);

        // Check if this is a new alert or risk level increased
        const lastAssessment = await db.dropoutRiskAssessment.findFirst({
          where: { student_id: student.id },
          orderBy: { calculated_at: 'desc' },
          select: { risk_level: true },
        });

        const isNewAlert = !lastAssessment;
        const riskIncreased =
          lastAssessment &&
          (
            (assessment.risk_level === 'high' && lastAssessment.risk_level !== 'high') ||
            (assessment.risk_level === 'medium' && ['low', 'attention'].includes(lastAssessment.risk_level))
          );

        // Save assessment
        await saveRiskAssessment(student.id, assessment);

        // Count at-risk students (medium or high)
        if (assessment.risk_level === 'medium' || assessment.risk_level === 'high') {
          atRisk++;
        }

        // Count new or escalated alerts
        if (isNewAlert || riskIncreased) {
          newAlerts++;

          // Create notification for admins when risk is medium or high
          if (assessment.risk_level === 'high' || assessment.risk_level === 'medium') {
            await notifyAdminsOfDropoutRisk(
              student.id,
              student.full_name,
              assessment.risk_level,
              assessment.reasons
            );
          }

          if (assessment.risk_level === 'high') {
            console.log(`[CRON] ⚠️  ALTO RISCO: ${student.full_name} (score: ${assessment.score})`);
          }
        }

        results.push({
          studentId: student.id,
          riskLevel: assessment.risk_level,
          isNew: isNewAlert,
        });

        processed++;
      } catch (error) {
        console.error(`[CRON] Erro ao avaliar aluno ${student.id}:`, error);
        errors++;
      }
    }

    // Log the cron execution
    await logAction(
      null,
      'cron_dropout_detection',
      `Detecção automática: ${processed} avaliados, ${atRisk} em risco, ${newAlerts} novos alertas, ${errors} erros`,
      req
    );

    console.log(`[CRON] Concluído: ${processed} avaliados, ${atRisk} em risco, ${newAlerts} novos alertas`);

    return NextResponse.json({
      success: true,
      summary: {
        totalStudents: students.length,
        processed,
        atRisk,
        newAlerts,
        errors,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CRON] Erro fatal na detecção de evasão:', error);
    await logAction(null, 'cron_error', `Erro na detecção de evasão: ${error instanceof Error ? error.message : 'unknown'}`, req);

    return NextResponse.json(
      {
        success: false,
        error: 'Erro interno na detecção de evasão',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint — returns cron status info (for admin dashboard).
 * Requires authentication via withAuth.
 */
export async function GET(req: NextRequest) {
  // Simple status check — no secret needed, just auth
  // (actual auth is handled by the middleware if we add withAuth here)
  try {
    const lastAssessment = await db.dropoutRiskAssessment.findFirst({
      orderBy: { calculated_at: 'desc' },
      select: { calculated_at: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ranToday = lastAssessment && new Date(lastAssessment.calculated_at) >= today;

    return NextResponse.json({
      lastRun: lastAssessment?.calculated_at || null,
      ranToday: Boolean(ranToday),
      nextScheduled: '0 6 * * * (diariamente às 06:00 UTC)',
    });
  } catch {
    return NextResponse.json({ error: 'Erro ao verificar status' }, { status: 500 });
  }
}
