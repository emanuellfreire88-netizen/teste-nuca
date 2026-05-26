import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

// GET: List badges (any authenticated user)
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const student_id = searchParams.get('student_id') || '';

    const where: Record<string, unknown> = {};
    if (student_id) where.student_id = student_id;

    const badges = await db.participationBadge.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            full_name: true,
            photo: true,
            school: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { earned_at: 'desc' },
    });

    return NextResponse.json({ badges });
  } catch (error) {
    console.error('List badges error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

// POST: Check and award badges (Admin only)
export const POST = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const badgeThresholds = [
      { badge_type: '5_events', threshold: 5 },
      { badge_type: '10_events', threshold: 10 },
      { badge_type: '20_events', threshold: 20 },
    ];

    // Get all students with their participation counts
    const participations = await db.eventParticipant.findMany({
      select: { student_id: true },
    });

    // Count participations per student
    const studentCountMap = new Map<string, number>();
    for (const p of participations) {
      const count = studentCountMap.get(p.student_id) || 0;
      studentCountMap.set(p.student_id, count + 1);
    }

    // Get all existing badges
    const existingBadges = await db.participationBadge.findMany({
      select: { student_id: true, badge_type: true },
    });

    const existingBadgeSet = new Set(
      existingBadges.map(b => `${b.student_id}:${b.badge_type}`)
    );

    // Determine new badges to create
    const newBadges: Array<{ student_id: string; badge_type: string }> = [];

    for (const [studentId, count] of studentCountMap.entries()) {
      for (const bt of badgeThresholds) {
        if (count >= bt.threshold && !existingBadgeSet.has(`${studentId}:${bt.badge_type}`)) {
          newBadges.push({
            student_id: studentId,
            badge_type: bt.badge_type,
          });
        }
      }
    }

    // Create new badges
    const awardedBadges: Array<{
      id: string;
      student_id: string;
      badge_type: string;
      earned_at: Date;
      student: {
        id: string;
        full_name: string;
        photo: string | null;
        school: { id: string; name: string } | null;
      };
    }> = [];
    for (const badge of newBadges) {
      const created = await db.participationBadge.create({
        data: {
          student_id: badge.student_id,
          badge_type: badge.badge_type,
        },
        include: {
          student: {
            select: {
              id: true,
              full_name: true,
              photo: true,
              school: { select: { id: true, name: true } },
            },
          },
        },
      });
      awardedBadges.push(created);
    }

    await logAction(
      req.user!.userId,
      'award_badges',
      `${awardedBadges.length} novo(s) badge(s) concedido(s)`,
      req
    );

    return NextResponse.json({
      message: `${awardedBadges.length} novo(s) badge(s) concedido(s)`,
      awarded: awardedBadges,
      total_checked: studentCountMap.size,
    });
  } catch (error) {
    console.error('Award badges error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
