import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';

// ---------------------------------------------------------------------------
// GET /api/students/documents-pending — Summary of students with pending documents
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
      // Non-admin
      if (schoolId) {
        if (!allowedSchoolIds.includes(schoolId)) {
          // Out of scope — return empty
          return NextResponse.json({ students: [] });
        }
        studentWhere.school_id = schoolId;
      } else {
        studentWhere.school_id = { in: allowedSchoolIds };
      }
    } else if (schoolId) {
      // Admin explicitly filtering by school
      studentWhere.school_id = schoolId;
    }

    // ── Fetch students with their documents ──
    const students = await db.student.findMany({
      where: studentWhere,
      select: {
        id: true,
        full_name: true,
        school: {
          select: { name: true },
        },
        documents: {
          select: {
            status: true,
          },
        },
      },
      orderBy: { full_name: 'asc' },
    });

    // ── Build summary — only include students that have at least one document
    //    record (pending, delivered, or verified) ──
    const summary = students
      .filter((s) => s.documents.length > 0)
      .map((s) => {
        let pendingCount = 0;
        let deliveredCount = 0;
        let verifiedCount = 0;

        for (const doc of s.documents) {
          switch (doc.status) {
            case 'pending':
              pendingCount++;
              break;
            case 'delivered':
              deliveredCount++;
              break;
            case 'verified':
              verifiedCount++;
              break;
          }
        }

        return {
          id: s.id,
          full_name: s.full_name,
          school_name: s.school.name,
          pending_count: pendingCount,
          delivered_count: deliveredCount,
          verified_count: verifiedCount,
        };
      });

    return NextResponse.json({ students: summary });
  } catch (error) {
    console.error('Pending documents summary error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
