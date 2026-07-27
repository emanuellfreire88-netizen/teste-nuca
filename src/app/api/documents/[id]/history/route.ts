import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';

export const dynamic = 'force-dynamic';

// ─── GET: Get all history entries for a document ───
export const GET = withAuth(async (req: AuthenticatedRequest, context?: { params: Promise<Record<string, string>> }) => {
  try {
    if (!context?.params) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    const { id } = await context.params;

    const document = await db.docManagementDocument.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Documento não encontrado' },
        { status: 404 }
      );
    }

    const history = await db.docManagementHistory.findMany({
      where: { document_id: id },
      include: {
        user: {
          select: { id: true, full_name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error('Error fetching document history:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar histórico do documento' },
      { status: 500 }
    );
  }
});
