import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ─── Allowed status transitions ───
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['generated', 'cancelled'],
  generated: ['printed', 'cancelled'],
  printed: ['signed', 'cancelled'],
  signed: ['sent', 'cancelled'],
  sent: ['received', 'cancelled'],
  received: ['archived', 'cancelled'],
  archived: [],
  cancelled: [],
};

// ─── PUT: Change document status ───
export const PUT = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest, context?: { params: Promise<Record<string, string>> }) => {
  try {
    if (!context?.params) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    const { id } = await context.params;
    const body = await req.json();
    const userId = req.user!.userId;

    const newStatus = body.status;
    if (!newStatus) {
      return NextResponse.json(
        { error: 'Status não fornecido' },
        { status: 400 }
      );
    }

    const VALID_STATUSES = ['draft', 'generated', 'printed', 'signed', 'sent', 'received', 'archived', 'cancelled'];
    if (!VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { error: 'Status inválido' },
        { status: 400 }
      );
    }

    const existing = await db.docManagementDocument.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Documento não encontrado' },
        { status: 404 }
      );
    }

    const currentStatus = existing.status;

    // Check if transition is allowed
    const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];
    // "Any → cancelled" is always allowed
    if (newStatus !== 'cancelled' && !allowedNext.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Transição de status não permitida: ${currentStatus} → ${newStatus}`,
          allowedTransitions: allowedNext,
        },
        { status: 400 }
      );
    }

    // Update the status
    const updated = await db.docManagementDocument.update({
      where: { id },
      data: { status: newStatus },
    });

    // Create history entry
    const statusLabels: Record<string, string> = {
      draft: 'Rascunho',
      generated: 'Gerado',
      printed: 'Impresso',
      signed: 'Assinado',
      sent: 'Enviado',
      received: 'Recebido',
      archived: 'Arquivado',
      cancelled: 'Cancelado',
    };

    await db.docManagementHistory.create({
      data: {
        document_id: id,
        user_id: userId,
        action: 'status_changed',
        description: `Status alterado de ${statusLabels[currentStatus]} para ${statusLabels[newStatus]}`,
        old_value: currentStatus,
        new_value: newStatus,
      },
    });

    await logAction(userId, 'status_change_doc_management', `Documento ${existing.number_formatted}: ${currentStatus} → ${newStatus}`);

    // Fetch with relations for response
    const fullDocument = await db.docManagementDocument.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, full_name: true, email: true },
        },
        template: {
          select: { id: true, name: true, display_name: true },
        },
      },
    });

    return NextResponse.json({ document: fullDocument });
  } catch (error) {
    console.error('Error changing document status:', error);
    return NextResponse.json(
      { error: 'Erro ao alterar status do documento' },
      { status: 500 }
    );
  }
});
