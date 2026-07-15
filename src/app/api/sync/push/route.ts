import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';

/**
 * Create a consistent UTC midnight Date from a date string like "2026-06-12".
 */
function toUTCDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

interface AttendanceInput {
  student_id: string;
  date: string;
  status: string;
}

interface ParticipationInput {
  event_id: string;
  student_id: string;
  attended: boolean;
  notes?: string;
}

interface ConflictItem {
  local: { student_id: string; date: string; status: string };
  server: { student_id: string; date: string; status: string };
}

interface ParticipationConflictItem {
  local: { event_id: string; student_id: string; attended: boolean };
  server: { event_id: string; student_id: string; attended: boolean };
}

/**
 * POST /api/sync/push
 *
 * Receives synced data from offline devices.
 * Checks for conflicts (same student_id + date with different statuses).
 * Returns synced count and conflicts for frontend resolution.
 */
export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { device_id, records, participations } = body as {
      device_id?: string;
      records?: AttendanceInput[];
      participations?: ParticipationInput[];
    };

    if (!device_id) {
      return NextResponse.json(
        { error: 'device_id é obrigatório' },
        { status: 400 }
      );
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    const allowedSchoolIds = await getUserSchoolIds(userId, role);

    const attendanceConflicts: ConflictItem[] = [];
    const participationConflicts: ParticipationConflictItem[] = [];
    let syncedCount = 0;

    // ── Process attendance records ──
    if (Array.isArray(records) && records.length > 0) {
      if (records.length > 500) {
        return NextResponse.json(
          { error: 'Máximo de 500 registros de frequência por requisição' },
          { status: 400 }
        );
      }

      // Validate records
      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        if (!rec.student_id || !rec.date || !rec.status) {
          return NextResponse.json(
            { error: `Registro ${i}: student_id, date e status são obrigatórios` },
            { status: 400 }
          );
        }
        if (!['present', 'absent'].includes(rec.status)) {
          return NextResponse.json(
            { error: `Registro ${i}: status inválido. Use: present ou absent` },
            { status: 400 }
          );
        }
      }

      // Verify students exist and user has access
      const studentIds = [...new Set(records.map((r) => r.student_id))];
      const existingStudents = await db.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, school_id: true },
      });
      const studentMap = new Map(existingStudents.map((s) => [s.id, s.school_id]));

      // Check access for non-admins
      if (allowedSchoolIds !== null) {
        const allowedSet = new Set(allowedSchoolIds);
        for (const rec of records) {
          const schoolId = studentMap.get(rec.student_id);
          if (!schoolId || !allowedSet.has(schoolId)) {
            return NextResponse.json(
              { error: `Você não tem permissão para acessar o aluno ${rec.student_id}` },
              { status: 403 }
            );
          }
        }
      }

      // Check each record against existing data
      for (const rec of records) {
        if (!studentMap.has(rec.student_id)) {
          return NextResponse.json(
            { error: `Aluno não encontrado: ${rec.student_id}` },
            { status: 404 }
          );
        }

        const dateObj = toUTCDate(rec.date);

        // Check for existing record
        const existing = await db.attendanceRecord.findUnique({
          where: {
            student_id_date: {
              student_id: rec.student_id,
              date: dateObj,
            },
          },
        });

        if (existing) {
          if (existing.status !== rec.status) {
            // Conflict: same student+date but different status
            attendanceConflicts.push({
              local: {
                student_id: rec.student_id,
                date: rec.date,
                status: rec.status,
              },
              server: {
                student_id: existing.student_id,
                date: existing.date.toISOString().split('T')[0],
                status: existing.status,
              },
            });
          }
          // If status matches, it's already synced — skip
        } else {
          // No existing record — safe to create
          await db.attendanceRecord.create({
            data: {
              student_id: rec.student_id,
              date: dateObj,
              status: rec.status,
              created_by: userId,
            },
          });
          syncedCount++;
        }
      }
    }

    // ── Process event participations ──
    if (Array.isArray(participations) && participations.length > 0) {
      if (participations.length > 500) {
        return NextResponse.json(
          { error: 'Máximo de 500 participações por requisição' },
          { status: 400 }
        );
      }

      // Validate participations
      for (let i = 0; i < participations.length; i++) {
        const p = participations[i];
        if (!p.event_id || !p.student_id) {
          return NextResponse.json(
            { error: `Participação ${i}: event_id e student_id são obrigatórios` },
            { status: 400 }
          );
        }
        if (typeof p.attended !== 'boolean') {
          return NextResponse.json(
            { error: `Participação ${i}: attended deve ser booleano` },
            { status: 400 }
          );
        }
      }

      // Verify students exist and user has access
      const partStudentIds = [...new Set(participations.map((p) => p.student_id))];
      const partStudents = await db.student.findMany({
        where: { id: { in: partStudentIds } },
        select: { id: true, school_id: true },
      });
      const partStudentMap = new Map(partStudents.map((s) => [s.id, s.school_id]));

      // Check access for non-admins
      if (allowedSchoolIds !== null) {
        const allowedSet = new Set(allowedSchoolIds);
        for (const p of participations) {
          const schoolId = partStudentMap.get(p.student_id);
          if (!schoolId || !allowedSet.has(schoolId)) {
            return NextResponse.json(
              { error: `Você não tem permissão para acessar o aluno ${p.student_id}` },
              { status: 403 }
            );
          }
        }
      }

      // Check each participation against existing data
      for (const p of participations) {
        if (!partStudentMap.has(p.student_id)) {
          return NextResponse.json(
            { error: `Aluno não encontrado: ${p.student_id}` },
            { status: 404 }
          );
        }

        // Check for existing participation
        const existing = await db.eventParticipant.findUnique({
          where: {
            event_id_student_id: {
              event_id: p.event_id,
              student_id: p.student_id,
            },
          },
        });

        if (existing) {
          if (existing.attended !== p.attended) {
            // Conflict: same event+student but different attended
            participationConflicts.push({
              local: {
                event_id: p.event_id,
                student_id: p.student_id,
                attended: p.attended,
              },
              server: {
                event_id: existing.event_id,
                student_id: existing.student_id,
                attended: existing.attended,
              },
            });
          }
          // If attended matches, it's already synced — skip
        } else {
          // No existing participation — safe to create
          await db.eventParticipant.create({
            data: {
              event_id: p.event_id,
              student_id: p.student_id,
              attended: p.attended,
              notes: p.notes || null,
              added_by: userId,
            },
          });
          syncedCount++;
        }
      }
    }

    // Update SyncRecord for this device/user
    const now = new Date();
    await db.syncRecord.upsert({
      where: {
        device_id_user_id: {
          device_id,
          user_id: userId,
        },
      },
      create: {
        device_id,
        user_id: userId,
        last_sync_at: now,
        sync_status: attendanceConflicts.length > 0 || participationConflicts.length > 0
          ? 'pending'
          : 'synced',
        pending_count: attendanceConflicts.length + participationConflicts.length,
      },
      update: {
        last_sync_at: now,
        sync_status: attendanceConflicts.length > 0 || participationConflicts.length > 0
          ? 'pending'
          : 'synced',
        pending_count: attendanceConflicts.length + participationConflicts.length,
      },
    });

    return NextResponse.json({
      synced: syncedCount,
      conflicts: attendanceConflicts,
      participation_conflicts: participationConflicts,
    });
  } catch (error) {
    console.error('Sync push error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
