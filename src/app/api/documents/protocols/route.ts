import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { ciContains } from '@/lib/search';

export const dynamic = 'force-dynamic';

// ─── GET: Search by protocol number ───
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const protocol = searchParams.get('protocol') || '';

    if (!protocol) {
      return NextResponse.json(
        { error: 'Protocolo não fornecido. Use ?protocol=valor' },
        { status: 400 }
      );
    }

    // Try exact match first
    const document = await db.docManagementDocument.findUnique({
      where: { protocol },
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
        template: {
          select: { id: true, name: true, display_name: true },
        },
      },
    });

    if (document) {
      return NextResponse.json({ document });
    }

    // If exact match not found, try partial match
    const documents = await db.docManagementDocument.findMany({
      where: {
        protocol: ciContains(protocol),
      },
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
        template: {
          select: { id: true, name: true, display_name: true },
        },
      },
      take: 10,
    });

    if (documents.length === 0) {
      return NextResponse.json(
        { error: 'Documento não encontrado para o protocolo informado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Error searching by protocol:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar por protocolo' },
      { status: 500 }
    );
  }
});
