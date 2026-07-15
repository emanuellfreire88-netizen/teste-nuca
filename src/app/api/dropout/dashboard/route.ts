import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';

// ---------------------------------------------------------------------------
// GET /api/dropout/dashboard — Dropout detection dashboard stats
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const schoolId = searchParams.get('school_id') || '';

    // ── School scoping ──
    const allowedSchoolIds = await getUserSchoolIds(
      req.user!.userId,
      req.user!.role
    );

    const studentWhere: Record<string, unknown> = { status: 'active' };

    if (allowedSchoolIds !== null) {
      if (schoolId) {
        if (!allowedSchoolIds.includes(schoolId)) {
          // Out of scope — return empty dashboard
          return NextResponse.json({
            total_at_risk: 0,
            high_risk_count: 0,
            medium_risk_count: 0,
            recovered_count: 0,
            attention_count: 0,
            low_risk_count: 0,
            average_attendance: 0,
            risk_distribution_by_month: [],
          });
        }
        studentWhere.school_id = schoolId;
      } else {
        studentWhere.school_id = { in: allowedSchoolIds };
      }
    } else if (schoolId) {
      studentWhere.school_id = schoolId;
    }

    // ── Fetch all students with their latest risk assessment ──
    const students = await db.student.findMany({
      where: studentWhere,
      include: {
        dropout_risk_assessments: {
          orderBy: { calculated_at: 'desc' },
          take: 1,
        },
      },
    });

    // ── Calculate risk level counts ──
    let highRiskCount = 0;
    let mediumRiskCount = 0;
    let attentionCount = 0;
    let lowRiskCount = 0;
    let recoveredCount = 0;
    let totalAttendance = 0;
    let studentsWithAttendance = 0;

    for (const student of students) {
      const latest = student.dropout_risk_assessments[0];
      const riskLevel = latest?.risk_level ?? 'low';

      switch (riskLevel) {
        case 'high':
          highRiskCount++;
          break;
        case 'medium':
          mediumRiskCount++;
          break;
        case 'attention':
          attentionCount++;
          break;
        default:
          lowRiskCount++;
          break;
      }

      // Track attendance for average calculation
      if (latest) {
        totalAttendance += latest.attendance_percentage;
        studentsWithAttendance++;
      }

      // Check if student is "recovered" — current risk is low/attention but
      // previous risk was high/medium
      if (
        latest &&
        (riskLevel === 'low' || riskLevel === 'attention') &&
        latest.previous_risk_level &&
        (latest.previous_risk_level === 'high' ||
          latest.previous_risk_level === 'medium')
      ) {
        recoveredCount++;
      }
    }

    const totalAtRisk = highRiskCount + mediumRiskCount + attentionCount;
    const averageAttendance =
      studentsWithAttendance > 0
        ? Math.round((totalAttendance / studentsWithAttendance) * 100) / 100
        : 0;

    // ── Risk distribution by month (for chart) ──
    // Get assessments from the last 6 months, grouped by month
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const recentAssessments = await db.dropoutRiskAssessment.findMany({
      where: {
        calculated_at: { gte: sixMonthsAgo },
        student: studentWhere,
      },
      select: {
        risk_level: true,
        calculated_at: true,
      },
      orderBy: { calculated_at: 'asc' },
    });

    // Group by month
    const monthMap = new Map<
      string,
      { high: number; medium: number; attention: number; low: number }
    >();

    for (const assessment of recentAssessments) {
      const d = new Date(assessment.calculated_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const existing = monthMap.get(key);
      if (existing) {
        switch (assessment.risk_level) {
          case 'high':
            existing.high++;
            break;
          case 'medium':
            existing.medium++;
            break;
          case 'attention':
            existing.attention++;
            break;
          default:
            existing.low++;
            break;
        }
      } else {
        const entry = { high: 0, medium: 0, attention: 0, low: 0 };
        switch (assessment.risk_level) {
          case 'high':
            entry.high = 1;
            break;
          case 'medium':
            entry.medium = 1;
            break;
          case 'attention':
            entry.attention = 1;
            break;
          default:
            entry.low = 1;
            break;
        }
        monthMap.set(key, entry);
      }
    }

    const riskDistributionByMonth = Array.from(monthMap.entries())
      .map(([period, counts]) => ({ period, ...counts }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return NextResponse.json({
      total_at_risk: totalAtRisk,
      high_risk_count: highRiskCount,
      medium_risk_count: mediumRiskCount,
      attention_count: attentionCount,
      low_risk_count: lowRiskCount,
      recovered_count: recoveredCount,
      average_attendance: averageAttendance,
      risk_distribution_by_month: riskDistributionByMonth,
    });
  } catch (error) {
    console.error('Dropout dashboard error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
