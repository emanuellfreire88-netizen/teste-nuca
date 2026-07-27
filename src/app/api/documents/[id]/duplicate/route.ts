import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ─── Document type labels for number_formatted ───
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  oficio: 'Ofício',
  memorando: 'Memorando',
  declaracao: 'Declaração',
  convite: 'Convite',
  comunicado: 'Comunicado',
  solicitacao_transporte: 'Solicitação de Transporte',
  solicitacao_espaco: 'Solicitação de Espaço',
  solicitacao_alimentacao: 'Solicitação de Alimentação',
  encaminhamento: 'Encaminhamento',
  relatorio: 'Relatório',
  certificado: 'Certificado',
  outros: 'Documento',
};

// ─── POST: Duplicate a document ───
export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest, context?: { params: Promise<Record<string, string>> }) => {
  try {
    if (!context?.params) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    const { id } = await context.params;
    const userId = req.user!.userId;

    const existing = await db.docManagementDocument.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Documento não encontrado' },
        { status: 404 }
      );
    }

    // Use current date for the duplicate
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

    // ─── Auto-generate new sequential number ───
    const maxNumberDoc = await db.docManagementDocument.findFirst({
      where: { document_type: existing.document_type, year: currentYear },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const nextNumber = maxNumberDoc ? maxNumberDoc.number + 1 : 1;
    const numberFormatted = `${DOCUMENT_TYPE_LABELS[existing.document_type]} nº ${String(nextNumber).padStart(3, '0')}/${currentYear}`;

    // ─── Auto-generate new protocol number ───
    const maxProtocolDoc = await db.docManagementDocument.findFirst({
      where: { year: currentYear },
      orderBy: { protocol: 'desc' },
      select: { protocol: true },
    });

    let nextProtocolSeq = 1;
    if (maxProtocolDoc?.protocol) {
      const parts = maxProtocolDoc.protocol.split('-');
      if (parts.length === 2) {
        const seq = parseInt(parts[1], 10);
        if (!isNaN(seq)) {
          nextProtocolSeq = seq + 1;
        }
      }
    }
    const protocol = `${currentYear}-${String(nextProtocolSeq).padStart(6, '0')}`;

    // ─── Create the duplicated document ───
    // Copy all fields except number/protocol/date (use current date). Set status to "draft".
    const newDocument = await db.docManagementDocument.create({
      data: {
        document_type: existing.document_type,
        number: nextNumber,
        number_formatted: numberFormatted,
        year: currentYear,
        protocol,
        date: currentDate,
        recipient: existing.recipient,
        recipient_title: existing.recipient_title,
        institution: existing.institution,
        subject: existing.subject,
        body_text: existing.body_text,
        internal_notes: existing.internal_notes,
        status: 'draft',
        signature1_name: existing.signature1_name,
        signature1_title: existing.signature1_title,
        signature2_name: existing.signature2_name,
        signature2_title: existing.signature2_title,
        signature3_name: existing.signature3_name,
        signature3_title: existing.signature3_title,
        template_id: existing.template_id,
        created_by: userId,
      },
    });

    // ─── Create history entries ───
    // For the original document: "duplicated"
    await db.docManagementHistory.create({
      data: {
        document_id: id,
        user_id: userId,
        action: 'duplicated',
        description: `Documento duplicado para ${numberFormatted} (protocolo ${protocol})`,
        new_value: newDocument.id,
      },
    });

    // For the new document: "created from duplicate"
    await db.docManagementHistory.create({
      data: {
        document_id: newDocument.id,
        user_id: userId,
        action: 'created',
        description: `Documento criado a partir da duplicação de ${existing.number_formatted}`,
        old_value: id,
      },
    });

    // Fetch with relations for response
    const fullDocument = await db.docManagementDocument.findUnique({
      where: { id: newDocument.id },
      include: {
        creator: {
          select: { id: true, full_name: true, email: true },
        },
        template: {
          select: { id: true, name: true, display_name: true },
        },
      },
    });

    await logAction(userId, 'duplicate_doc_management', `Documento ${existing.number_formatted} duplicado como ${numberFormatted}`);

    return NextResponse.json({ document: fullDocument }, { status: 201 });
  } catch (error) {
    console.error('Error duplicating document:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Número ou protocolo duplicado. Tente novamente.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Erro ao duplicar documento' },
      { status: 500 }
    );
  }
});
