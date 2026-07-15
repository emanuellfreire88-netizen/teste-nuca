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

interface AttendanceResolution {
  type: 'attendance';
  student_id: string;
  date: string;
  status: string;
}

interface ParticipationResolution {
  type: 'participation';
  event_id: string;
  student_id: string;
  attended: boolean;
  notes?: string;
}

type Resolution = AttendanceResolution | ParticipationResolution;

/**
 * POST /api/sync/resolve-conflicts
 *
 * Resolves sync conflicts by applying the chosen values.
 * Admin/Operator only.
 */
export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { resolutions, device_id } = body as {
      resolutions?: Resolution[];
      device_id?: string;
    };

    if (!Array.isArray(resolutions) || resolutions.length === 0) {
      return NextResponse.json(
        { error: 'Array de resoluções não pode estar vazio' },
        { status: 400 }
      );
    }

    if (resolutions.length > 500) {
      return NextResponse.json(
        { error: 'Máximo de 500 resoluções por requisição' },
        { status: 400 }
      );
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    const allowedSchoolIds = await getUserSchoolIds(userId, role);

    let resolvedCount = 0;

    for (const resolution of resolutions) {
      if (resolution.type === 'attendance') {
        // ── Resolve attendance conflict ──
        const { student_id, date, status } = resolution;

        if (!student_id || !date || !status) {
          return NextResponse.json(
            { error: 'Resolução de frequência: student_id, date e status são obrigatórios' },
            { status: 400 }
          );
        }

        if (!['present', 'absent'].includes(status)) {
          return NextResponse.json(
            { error: 'Status inválido. Use: present ou absent' },
            { status: 400 }
          );
        }

        // Check access for non-admins
        if (allowedSchoolIds !== null) {
          const student = await db.student.findUnique({
            where: { id: student_id },
            select: { school_id: true },
          });
          if (!student || !allowedSchoolIds.includes(student.school_id)) {
            return NextResponse.json(
              { error: `Você não tem permissão para acessar o aluno ${student_id}` },
              { status: 403 }
            );
          }
        }

        const dateObj = toUTCDate(date);

        // Upsert the resolved value
        await db.attendanceRecord.upsert({
          where: {
            student_id_date: {
              student_id,
              date: dateObj,
            },
          },
          create: {
            student_id,
            date: dateObj,
            status,
            created_by: userId,
          },
          update: {
            status,
            created_by: userId,
          },
        });

        resolvedCount++;
      } else if (resolution.type === 'participation') {
        // ── Resolve participation conflict ──
        const { event_id, student_id, attended, notes } = resolution;

        if (!event_id || !student_id) {
          return NextResponse.json(
            { error: 'Resolução de participação: event_id e student_id são obrigatórios' },
            { status: 400 }
          );
        }

        if (typeof attended !== 'boolean') {
          return NextResponse.json(
            { error: 'attended deve ser booleano' },
            { status: 400 }
          );
        }

        // Check access for non-admins
        if (allowedSchoolIds !== null) {
          const student = await db.student.findUnique({
            where: { id: student_id },
            select: { school_id: true },
          });
          if (!student || !allowedSchoolIds.includes(student.school_id)) {
            return NextResponse.json(
              { error: `Você não tem permissão para acessar o aluno ${student_id}` },
              { status: 403 }
            );
          }
        }

        // Upsert the resolved value
        await db.eventParticipant.upsert({
          where: {
            event_id_student_id: {
              event_id,
              student_id,
            },
          },
          create: {
            event_id,
            student_id,
            attended,
            notes: notes || null,
            added_by: userId,
          },
          update: {
            attended,
            notes: notes ?? undefined,
            added_by: userId,
          },
        });

        resolvedCount++;
      } else {
        return NextResponse.json(
          { error: `Tipo de resolução inválido: ${(resolution as Record<string, unknown>).type}. Use: attendance ou participation` },
          { status: 400 }
        );
      }
    }

    // Update SyncRecord if device_id provided
    if (device_id) {
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
          last_sync_at: new Date(),
          sync_status: 'synced',
          pending_count: 0,
        },
        update: {
          last_sync_at: new Date(),
          sync_status: 'synced',
          pending_count: 0,
        },
      });
    }

    return NextResponse.json({
      resolved: resolvedCount,
    });
  } catch (error) {
    console.error('Resolve conflicts error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
