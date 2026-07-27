import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { ciContains } from '@/lib/search';
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

const VALID_DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABELS);
const VALID_STATUSES = ['draft', 'generated', 'printed', 'signed', 'sent', 'received', 'archived', 'cancelled'];

// ─── GET: List documents with pagination, filtering, search ───
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20')), 200);
    const skip = (page - 1) * limit;

    const search = searchParams.get('search') || '';
    const document_type = searchParams.get('document_type') || '';
    const status = searchParams.get('status') || '';
    const year = searchParams.get('year') || '';
    const recipient = searchParams.get('recipient') || '';
    const subject = searchParams.get('subject') || '';
    const protocol = searchParams.get('protocol') || '';
    const date_from = searchParams.get('date_from') || '';
    const date_to = searchParams.get('date_to') || '';

    const where: Record<string, unknown> = {};

    // Full-text search across multiple fields
    if (search) {
      where.OR = [
        { number_formatted: ciContains(search) },
        { protocol: ciContains(search) },
        { recipient: ciContains(search) },
        { subject: ciContains(search) },
        { institution: ciContains(search) },
        { body_text: ciContains(search) },
        { internal_notes: ciContains(search) },
      ];
    }

    if (document_type && VALID_DOCUMENT_TYPES.includes(document_type)) {
      where.document_type = document_type;
    }
    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }
    if (year) {
      where.year = parseInt(year);
    }
    if (recipient) {
      where.recipient = ciContains(recipient);
    }
    if (subject) {
      where.subject = ciContains(subject);
    }
    if (protocol) {
      where.protocol = ciContains(protocol);
    }

    // Date range filter
    if (date_from || date_to) {
      const dateFilter: Record<string, Date> = {};
      if (date_from) dateFilter.gte = new Date(date_from);
      if (date_to) dateFilter.lte = new Date(date_to);
      where.date = dateFilter;
    }

    const [documents, total] = await Promise.all([
      db.docManagementDocument.findMany({
        where,
        include: {
          creator: {
            select: { id: true, full_name: true, email: true },
          },
          template: {
            select: { id: true, name: true, display_name: true },
          },
        },
        orderBy: [
          { created_at: 'desc' },
        ],
        skip,
        take: limit,
      }),
      db.docManagementDocument.count({ where }),
    ]);

    return NextResponse.json({
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing documents:', error);
    return NextResponse.json(
      { error: 'Erro ao listar documentos' },
      { status: 500 }
    );
  }
});

// ─── POST: Create a new document ───
export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const userId = req.user!.userId;

    // Validate required fields
    const document_type = body.document_type;
    if (!document_type || !VALID_DOCUMENT_TYPES.includes(document_type)) {
      return NextResponse.json(
        { error: 'Tipo de documento inválido' },
        { status: 400 }
      );
    }

    const documentDate = body.date ? new Date(body.date) : new Date();
    const year = documentDate.getFullYear();

    // Validate optional fields
    const status = body.status || 'draft';
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'Status inválido' },
        { status: 400 }
      );
    }

    // ─── Auto-generate sequential number ───
    // Find the max number for this document_type + year combination
    const maxNumberDoc = await db.docManagementDocument.findFirst({
      where: { document_type, year },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const nextNumber = maxNumberDoc ? maxNumberDoc.number + 1 : 1;
    const numberFormatted = `${DOCUMENT_TYPE_LABELS[document_type]} nº ${String(nextNumber).padStart(3, '0')}/${year}`;

    // ─── Auto-generate protocol number ───
    // Find the max protocol sequence for this year
    // Protocol format: "2026-000001"
    const currentYear = year;
    const maxProtocolDoc = await db.docManagementDocument.findFirst({
      where: { year: currentYear },
      orderBy: { protocol: 'desc' },
      select: { protocol: true },
    });

    let nextProtocolSeq = 1;
    if (maxProtocolDoc?.protocol) {
      // Extract the sequence part from "2026-000001"
      const parts = maxProtocolDoc.protocol.split('-');
      if (parts.length === 2) {
        const seq = parseInt(parts[1], 10);
        if (!isNaN(seq)) {
          nextProtocolSeq = seq + 1;
        }
      }
    }
    const protocol = `${currentYear}-${String(nextProtocolSeq).padStart(6, '0')}`;

    // ─── Apply template variables if template_id provided ───
    let body_text = body.body_text || '';
    if (body.template_id) {
      const template = await db.docManagementTemplate.findUnique({
        where: { id: body.template_id },
      });
      if (template?.body_text) {
        // If the body_text was not provided by user, use template body
        if (!body_text) {
          body_text = template.body_text;
        }
        // Replace template variables
        const configEntries = await db.docManagementConfig.findMany();
        const configMap: Record<string, string> = {};
        for (const entry of configEntries) {
          configMap[entry.config_key] = entry.config_value || '';
        }

        const dateFormatted = documentDate.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });

        body_text = body_text
          .replace(/\{\{numero_documento\}\}/g, numberFormatted)
          .replace(/\{\{protocolo\}\}/g, protocol)
          .replace(/\{\{data\}\}/g, dateFormatted)
          .replace(/\{\{ano\}\}/g, String(year))
          .replace(/\{\{destinatario\}\}/g, body.recipient || '')
          .replace(/\{\{cargo_destinatario\}\}/g, body.recipient_title || '')
          .replace(/\{\{instituicao\}\}/g, body.institution || '')
          .replace(/\{\{municipio\}\}/g, configMap.municipio || '');
      }
    }

    // ─── Create the document ───
    const document = await db.docManagementDocument.create({
      data: {
        document_type,
        number: nextNumber,
        number_formatted: numberFormatted,
        year,
        protocol,
        date: documentDate,
        recipient: body.recipient || null,
        recipient_title: body.recipient_title || null,
        institution: body.institution || null,
        subject: body.subject || null,
        body_text,
        internal_notes: body.internal_notes || null,
        status,
        signature1_name: body.signature1_name || null,
        signature1_title: body.signature1_title || null,
        signature2_name: body.signature2_name || null,
        signature2_title: body.signature2_title || null,
        signature3_name: body.signature3_name || null,
        signature3_title: body.signature3_title || null,
        template_id: body.template_id || null,
        created_by: userId,
      },
    });

    // ─── Create history entry for "created" ───
    await db.docManagementHistory.create({
      data: {
        document_id: document.id,
        user_id: userId,
        action: 'created',
        description: `Documento ${numberFormatted} criado com protocolo ${protocol}`,
        new_value: status,
      },
    });

    // ─── Fetch with relations for the response ───
    const fullDocument = await db.docManagementDocument.findUnique({
      where: { id: document.id },
      include: {
        creator: {
          select: { id: true, full_name: true, email: true },
        },
        template: {
          select: { id: true, name: true, display_name: true },
        },
      },
    });

    await logAction(userId, 'create_doc_management', `Documento ${numberFormatted} criado`);

    return NextResponse.json({ document: fullDocument }, { status: 201 });
  } catch (error) {
    console.error('Error creating document:', error);
    // Handle unique constraint violation (duplicate number or protocol)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Número ou protocolo duplicado. Tente novamente.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Erro ao criar documento' },
      { status: 500 }
    );
  }
});
