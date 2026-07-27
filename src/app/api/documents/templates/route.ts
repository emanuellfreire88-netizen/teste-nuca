import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const VALID_DOCUMENT_TYPES = [
  'oficio', 'memorando', 'declaracao', 'convite', 'comunicado',
  'solicitacao_transporte', 'solicitacao_espaco', 'solicitacao_alimentacao',
  'encaminhamento', 'relatorio', 'certificado', 'outros',
];

// ─── GET: List templates (with optional filters) ───
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const document_type = searchParams.get('document_type') || '';
    const is_active = searchParams.get('is_active') || '';

    const where: Record<string, unknown> = {};

    if (document_type && VALID_DOCUMENT_TYPES.includes(document_type)) {
      where.document_type = document_type;
    }
    if (is_active === 'true') {
      where.is_active = true;
    } else if (is_active === 'false') {
      where.is_active = false;
    }

    const templates = await db.docManagementTemplate.findMany({
      where,
      orderBy: [
        { is_default: 'desc' },
        { display_name: 'asc' },
      ],
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error listing templates:', error);
    return NextResponse.json(
      { error: 'Erro ao listar templates' },
      { status: 500 }
    );
  }
});

// ─── POST: Create a new template ───
export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const userId = req.user!.userId;

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'Nome do template é obrigatório' },
        { status: 400 }
      );
    }
    if (!body.display_name) {
      return NextResponse.json(
        { error: 'Nome de exibição é obrigatório' },
        { status: 400 }
      );
    }

    // Check uniqueness of name
    const existing = await db.docManagementTemplate.findUnique({
      where: { name: body.name },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Nome do template já existe' },
        { status: 409 }
      );
    }

    // Validate document_type if provided
    if (body.document_type && !VALID_DOCUMENT_TYPES.includes(body.document_type)) {
      return NextResponse.json(
        { error: 'Tipo de documento inválido' },
        { status: 400 }
      );
    }

    const template = await db.docManagementTemplate.create({
      data: {
        name: body.name,
        display_name: body.display_name,
        document_type: body.document_type || null,
        description: body.description || null,
        header_text: body.header_text || null,
        body_text: body.body_text || null,
        footer_text: body.footer_text || null,
        signature1_name: body.signature1_name || null,
        signature1_title: body.signature1_title || null,
        signature2_name: body.signature2_name || null,
        signature2_title: body.signature2_title || null,
        signature3_name: body.signature3_name || null,
        signature3_title: body.signature3_title || null,
        is_default: body.is_default || false,
        is_active: body.is_active !== undefined ? body.is_active : true,
        created_by: userId,
      },
    });

    await logAction(userId, 'create_doc_template', `Template "${body.display_name}" criado`);

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Nome do template já existe' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Erro ao criar template' },
      { status: 500 }
    );
  }
});

// ─── PUT: Update template ───
export const PUT = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const userId = req.user!.userId;
    const templateId = body.id;

    if (!templateId) {
      return NextResponse.json(
        { error: 'ID do template é obrigatório' },
        { status: 400 }
      );
    }

    const existing = await db.docManagementTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Template não encontrado' },
        { status: 404 }
      );
    }

    // Validate document_type if provided
    if (body.document_type && !VALID_DOCUMENT_TYPES.includes(body.document_type)) {
      return NextResponse.json(
        { error: 'Tipo de documento inválido' },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'display_name', 'document_type', 'description', 'header_text',
      'body_text', 'footer_text', 'signature1_name', 'signature1_title',
      'signature2_name', 'signature2_title', 'signature3_name', 'signature3_title',
      'is_default', 'is_active',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field] === '' ? null : body[field];
      }
    }

    // Handle name update separately (must stay unique)
    if (body.name && body.name !== existing.name) {
      const nameExists = await db.docManagementTemplate.findUnique({
        where: { name: body.name },
      });
      if (nameExists) {
        return NextResponse.json(
          { error: 'Nome do template já existe' },
          { status: 409 }
        );
      }
      updateData.name = body.name;
    }

    const updated = await db.docManagementTemplate.update({
      where: { id: templateId },
      data: updateData,
    });

    await logAction(userId, 'update_doc_template', `Template "${existing.display_name}" atualizado`);

    return NextResponse.json({ template: updated });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar template' },
      { status: 500 }
    );
  }
});

// ─── DELETE: Delete template (only if not is_default) ───
export const DELETE = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get('id');
    const userId = req.user!.userId;

    if (!templateId) {
      return NextResponse.json(
        { error: 'ID do template é obrigatório' },
        { status: 400 }
      );
    }

    const existing = await db.docManagementTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Template não encontrado' },
        { status: 404 }
      );
    }

    // If is_default, don't delete — set is_active=false instead
    if (existing.is_default) {
      const updated = await db.docManagementTemplate.update({
        where: { id: templateId },
        data: { is_active: false },
      });

      await logAction(userId, 'deactivate_doc_template', `Template padrão "${existing.display_name}" desativado`);

      return NextResponse.json({
        template: updated,
        message: 'Template padrão desativado (não pode ser excluído)',
      });
    }

    // Check if any documents are using this template
    const documentsUsingTemplate = await db.docManagementDocument.count({
      where: { template_id: templateId },
    });

    if (documentsUsingTemplate > 0) {
      // Soft delete: set is_active=false
      const updated = await db.docManagementTemplate.update({
        where: { id: templateId },
        data: { is_active: false },
      });

      await logAction(userId, 'deactivate_doc_template', `Template "${existing.display_name}" desativado (${documentsUsingTemplate} documentos associados)`);

      return NextResponse.json({
        template: updated,
        message: `Template desativado (${documentsUsingTemplate} documentos ainda associados)`,
      });
    }

    // Hard delete
    await db.docManagementTemplate.delete({
      where: { id: templateId },
    });

    await logAction(userId, 'delete_doc_template', `Template "${existing.display_name}" excluído`);

    return NextResponse.json({ message: 'Template excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir template' },
      { status: 500 }
    );
  }
});
