import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ─── GET: Get single document by ID ───
export const GET = withAuth(async (req: AuthenticatedRequest, context: { params: Promise<Record<string, string>> }) => {
  try {
    const { id } = await context.params;

    const document = await db.docManagementDocument.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, full_name: true, email: true },
        },
        template: {
          select: { id: true, name: true, display_name: true },
        },
        history: {
          include: {
            user: {
              select: { id: true, full_name: true },
            },
          },
          orderBy: { created_at: 'desc' },
        },
        attachments: {
          select: {
            id: true,
            file_name: true,
            file_type: true,
            file_size: true,
            uploaded_by: true,
            uploaded_at: true,
            // Do NOT include file_data (base64) in GET — too large
          },
          orderBy: { uploaded_at: 'desc' },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Documento não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ document });
  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar documento' },
      { status: 500 }
    );
  }
});

// ─── PUT: Update document fields ───
export const PUT = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest, context: { params: Promise<Record<string, string>> }) => {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const userId = req.user!.userId;

    // Fetch existing document
    const existing = await db.docManagementDocument.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Documento não encontrado' },
        { status: 404 }
      );
    }

    // Build update data — only allow updating certain fields
    const updateData: Record<string, unknown> = {};

    const allowedFields = [
      'recipient', 'recipient_title', 'institution', 'subject',
      'body_text', 'internal_notes', 'date',
      'signature1_name', 'signature1_title',
      'signature2_name', 'signature2_title',
      'signature3_name', 'signature3_title',
      'template_id',
    ];

    // Track changes for history
    const changes: string[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        const oldValue = existing[field as keyof typeof existing];
        const newValue = body[field];

        // For date field, convert to Date object
        if (field === 'date' && newValue) {
          updateData[field] = new Date(newValue);
          const oldDateStr = oldValue ? new Date(oldValue as string | Date).toLocaleDateString('pt-BR') : 'vazio';
          const newDateStr = new Date(newValue).toLocaleDateString('pt-BR');
          if (oldDateStr !== newDateStr) {
            changes.push(`Data: ${oldDateStr} → ${newDateStr}`);
          }
        } else {
          updateData[field] = newValue === '' ? null : newValue;
          const oldStr = String(oldValue ?? 'vazio');
          const newStr = String(newValue ?? 'vazio');
          if (oldStr !== newStr && field !== 'body_text') {
            // Don't log body_text changes in detail (too long)
            const fieldLabel = field.replace(/_/g, ' ');
            changes.push(`${fieldLabel}: "${oldStr}" → "${newStr}"`);
          } else if (field === 'body_text' && oldStr !== newStr) {
            changes.push('Texto do documento alterado');
          }
        }
      }
    }

    // Handle status change separately (with old/new tracking)
    if (body.status !== undefined) {
      const oldStatus = existing.status;
      const newStatus = body.status;
      if (oldStatus !== newStatus) {
        updateData.status = newStatus;
        changes.push(`Status: ${oldStatus} → ${newStatus}`);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'Nenhum campo para atualizar' },
        { status: 400 }
      );
    }

    // Update the document
    const updated = await db.docManagementDocument.update({
      where: { id },
      data: updateData,
    });

    // Create history entry
    const description = changes.length > 0
      ? `Documento editado: ${changes.join('; ')}`
      : 'Documento editado';

    await db.docManagementHistory.create({
      data: {
        document_id: id,
        user_id: userId,
        action: 'edited',
        description,
        old_value: body.status !== undefined && existing.status !== body.status ? existing.status : undefined,
        new_value: body.status !== undefined && existing.status !== body.status ? body.status : undefined,
      },
    });

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

    await logAction(userId, 'update_doc_management', `Documento ${existing.number_formatted} editado`);

    return NextResponse.json({ document: fullDocument });
  } catch (error) {
    console.error('Error updating document:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar documento' },
      { status: 500 }
    );
  }
});

// ─── DELETE: Only allow delete if status is "draft" or "cancelled" ───
export const DELETE = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest, context: { params: Promise<Record<string, string>> }) => {
  try {
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

    // Only allow delete if draft or cancelled
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      return NextResponse.json(
        { error: 'Documento só pode ser excluído se estiver em rascunho ou cancelado' },
        { status: 400 }
      );
    }

    // Create history entry before delete
    await db.docManagementHistory.create({
      data: {
        document_id: id,
        user_id: userId,
        action: 'cancelled',
        description: `Documento ${existing.number_formatted} excluído`,
        old_value: existing.status,
      },
    });

    // Delete the document (cascade will delete history and attachments)
    await db.docManagementDocument.delete({
      where: { id },
    });

    await logAction(userId, 'delete_doc_management', `Documento ${existing.number_formatted} excluído`);

    return NextResponse.json({ message: 'Documento excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir documento' },
      { status: 500 }
    );
  }
});
