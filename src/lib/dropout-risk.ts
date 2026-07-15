import { db } from '@/lib/db';

export interface RiskAssessment {
  score: number;
  risk_level: 'low' | 'attention' | 'medium' | 'high';
  reasons: string[];
  attendance_percentage: number;
  consecutive_absences: number;
  days_without_participation: number;
  previous_risk_level: string | null;
}

/**
 * Calculate dropout risk for a single student.
 *
 * Algorithm:
 *   1. 3+ consecutive absences        → +25 pts (5+ → +10 more)
 *   2. Attendance < 70% (60 days)      → +25 pts (<50% → +10 more)
 *   3. 45+ days without participation   → +20 pts (90+ → +10 more)
 *   4. Missed last 3 events             → +15 pts
 *   5. 30%+ drop in attendance          → +15 pts
 *
 * Risk levels: high ≥ 60 | medium ≥ 40 | attention ≥ 20 | low < 20
 */
export async function calculateStudentRisk(studentId: string): Promise<RiskAssessment> {
  const now = new Date();
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyToSixtyDaysAgo = new Date(now);
  thirtyToSixtyDaysAgo.setDate(thirtyToSixtyDaysAgo.getDate() - 60);

  // ── Fetch student with relations ──
  const student = await db.student.findUnique({
    where: { id: studentId },
    include: {
      attendance_records: {
        orderBy: { date: 'desc' },
      },
      event_participations: {
        orderBy: { added_at: 'desc' },
      },
      dropout_risk_assessments: {
        orderBy: { calculated_at: 'desc' },
        take: 1,
      },
    },
  });

  if (!student) {
    throw new Error(`Student not found: ${studentId}`);
  }

  let score = 0;
  const reasons: string[] = [];

  // Previous risk level (for evolution tracking)
  const previousRiskLevel = student.dropout_risk_assessments.length > 0
    ? student.dropout_risk_assessments[0].risk_level
    : null;

  // ── 1. Consecutive absences ──
  // Count consecutive 'absent' records starting from the most recent
  let consecutiveAbsences = 0;
  for (const record of student.attendance_records) {
    if (record.status === 'absent') {
      consecutiveAbsences++;
    } else {
      break;
    }
  }

  if (consecutiveAbsences >= 3) {
    score += 25;
    reasons.push('3+ faltas consecutivas');
  }
  if (consecutiveAbsences >= 5) {
    score += 10;
  }

  // ── 2. Attendance percentage (over last 60 days) ──
  const recentAttendanceRecords = student.attendance_records.filter(
    (r) => new Date(r.date) >= sixtyDaysAgo
  );

  const totalRecords = recentAttendanceRecords.length;
  const presentRecords = recentAttendanceRecords.filter(
    (r) => r.status === 'present'
  ).length;

  const attendancePercentage =
    totalRecords > 0 ? (presentRecords / totalRecords) * 100 : 100;

  if (attendancePercentage < 70) {
    score += 25;
    reasons.push('Frequência abaixo de 70%');
  }
  if (attendancePercentage < 50) {
    score += 10;
  }

  // ── 3. Days without participation ──
  const attendedParticipations = student.event_participations.filter(
    (p) => p.attended
  );

  let daysWithoutParticipation: number;
  if (attendedParticipations.length > 0) {
    // Most recent attended participation
    const lastParticipation = new Date(attendedParticipations[0].added_at);
    daysWithoutParticipation = Math.floor(
      (now.getTime() - lastParticipation.getTime()) / (1000 * 60 * 60 * 24)
    );
  } else {
    // Never participated — count from student creation
    daysWithoutParticipation = Math.floor(
      (now.getTime() - new Date(student.created_at).getTime()) /
        (1000 * 60 * 60 * 24)
    );
  }

  if (daysWithoutParticipation > 45) {
    score += 20;
    reasons.push('Mais de 45 dias sem participação');
  }
  if (daysWithoutParticipation > 90) {
    score += 10;
  }

  // ── 4. Absence in last events ──
  // Count of the most recent 3 events where the student was registered
  // but didn't attend, OR wasn't registered at all (for active students)
  const recentEventParticipations = student.event_participations.slice(0, 3);
  const missedLastEvents = recentEventParticipations.filter(
    (p) => !p.attended
  ).length;

  // If student has fewer than 3 participations but has attendance records,
  // check absences from recent attendance
  if (recentEventParticipations.length >= 3 && missedLastEvents >= 3) {
    score += 15;
    reasons.push('Não participou dos últimos 3 encontros');
  }

  // ── 5. Attendance drop compared to previous period ──
  // Current period: last 30 days | Previous period: 30-60 days ago
  const currentPeriodRecords = student.attendance_records.filter(
    (r) => new Date(r.date) >= thirtyDaysAgo
  );
  const previousPeriodRecords = student.attendance_records.filter((r) => {
    const d = new Date(r.date);
    return d >= thirtyToSixtyDaysAgo && d < thirtyDaysAgo;
  });

  const currentPeriodPct =
    currentPeriodRecords.length > 0
      ? (currentPeriodRecords.filter((r) => r.status === 'present').length /
          currentPeriodRecords.length) *
        100
      : 0;

  const previousPeriodPct =
    previousPeriodRecords.length > 0
      ? (previousPeriodRecords.filter((r) => r.status === 'present').length /
          previousPeriodRecords.length) *
        100
      : 0;

  if (
    previousPeriodPct > 0 &&
    previousPeriodPct - currentPeriodPct > 30
  ) {
    score += 15;
    reasons.push('Queda significativa na frequência');
  }

  // ── Classify risk ──
  let riskLevel: 'low' | 'attention' | 'medium' | 'high';
  if (score >= 60) {
    riskLevel = 'high';
  } else if (score >= 40) {
    riskLevel = 'medium';
  } else if (score >= 20) {
    riskLevel = 'attention';
  } else {
    riskLevel = 'low';
  }

  return {
    score,
    risk_level: riskLevel,
    reasons,
    attendance_percentage: Math.round(attendancePercentage * 100) / 100,
    consecutive_absences: consecutiveAbsences,
    days_without_participation: daysWithoutParticipation,
    previous_risk_level: previousRiskLevel,
  };
}

/**
 * Save a risk assessment to the database.
 */
export async function saveRiskAssessment(
  studentId: string,
  assessment: RiskAssessment
): Promise<void> {
  await db.dropoutRiskAssessment.create({
    data: {
      student_id: studentId,
      risk_level: assessment.risk_level,
      score: assessment.score,
      reasons: JSON.stringify(assessment.reasons),
      attendance_percentage: assessment.attendance_percentage,
      consecutive_absences: assessment.consecutive_absences,
      days_without_participation: assessment.days_without_participation,
      previous_risk_level: assessment.previous_risk_level,
    },
  });
}
