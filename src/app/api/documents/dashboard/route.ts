import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

// ─── GET: Dashboard statistics ───
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const currentYear = new Date().getFullYear();

    // ─── Total documents count ───
    const totalDocuments = await db.docManagementDocument.count();

    // ─── Documents by type ───
    const documentsByTypeRaw = await db.docManagementDocument.groupBy({
      by: ['document_type'],
      _count: { id: true },
    });
    const documentsByType = documentsByTypeRaw.map(item => ({
      document_type: item.document_type,
      count: item._count.id,
    }));

    // ─── Documents by status ───
    const documentsByStatusRaw = await db.docManagementDocument.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    const documentsByStatus = documentsByStatusRaw.map(item => ({
      status: item.status,
      count: item._count.id,
    }));

    // ─── Documents by month (current year) ───
    const documentsByMonthRaw = await db.docManagementDocument.findMany({
      where: { year: currentYear },
      select: { created_at: true },
    });

    const monthsMap: Record<string, number> = {};
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    for (const doc of documentsByMonthRaw) {
      const monthIndex = new Date(doc.created_at).getMonth();
      const monthKey = monthNames[monthIndex];
      monthsMap[monthKey] = (monthsMap[monthKey] || 0) + 1;
    }

    const documentsByMonth = monthNames.map(name => ({
      month: name,
      count: monthsMap[name] || 0,
    }));

    // ─── Documents by year ───
    const documentsByYearRaw = await db.docManagementDocument.groupBy({
      by: ['year'],
      _count: { id: true },
      orderBy: { year: 'desc' },
    });
    const documentsByYear = documentsByYearRaw.map(item => ({
      year: item.year,
      count: item._count.id,
    }));

    // ─── Recent documents (last 10) ───
    const recentDocuments = await db.docManagementDocument.findMany({
      take: 10,
      orderBy: { created_at: 'desc' },
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
      },
    });

    // ─── Pending documents (status not archived/cancelled) ───
    const pendingDocuments = await db.docManagementDocument.findMany({
      where: {
        status: { notIn: ['archived', 'cancelled'] },
      },
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({
      totalDocuments,
      documentsByType,
      documentsByStatus,
      documentsByMonth,
      documentsByYear,
      recentDocuments,
      pendingDocuments,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar estatísticas' },
      { status: 500 }
    );
  }
});
