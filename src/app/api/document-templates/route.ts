import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { seedDefaultTemplates } from '@/lib/seed-templates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET /api/document-templates?is_active=true|false
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const isActiveParam = searchParams.get('is_active');

    const where: Record<string, unknown> = {};

    if (isActiveParam !== null) {
      where.is_active = isActiveParam === 'true';
    }

    const templates = await db.documentTemplate.findMany({
      where,
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('List document templates error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/document-templates  — Create a new DocumentTemplate
// ---------------------------------------------------------------------------
export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const {
      name,
      display_name,
      description,
      header_text,
      body_text,
      footer_text,
      declaration,
      is_active,
      seed_default,
    } = body;

    // If seed_default is true, ensure the default authorization template exists
    if (seed_default) {
      const seeded = await seedDefaultTemplates();
      // If no name is provided (just seeding), return the seeded template
      if (!name) {
        return NextResponse.json({ template: seeded }, { status: 200 });
      }
    }

    if (!name) {
      return NextResponse.json(
        { error: 'Nome do modelo é obrigatório' },
        { status: 400 }
      );
    }

    if (!display_name) {
      return NextResponse.json(
        { error: 'Nome de exibição é obrigatório' },
        { status: 400 }
      );
    }

    // Check if template with this name already exists
    const existing = await db.documentTemplate.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Já existe um modelo com este nome' },
        { status: 409 }
      );
    }

    // NOTE: Neon HTTP adapter doesn't support transactions.
    // Use sequential operations instead.
    const created = await db.documentTemplate.create({
      data: {
        name,
        display_name,
        description: description || null,
        header_text: header_text || null,
        body_text: body_text || null,
        footer_text: footer_text || null,
        declaration: declaration || null,
        is_active: is_active !== undefined ? is_active : true,
        created_by: req.user!.userId,
      },
    });

    const template = await db.documentTemplate.findUnique({
      where: { id: created.id },
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
      },
    });

    await logAction(req.user!.userId, 'create_document_template', `Modelo de documento criado: ${name}`, req);

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Create document template error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// PUT /api/document-templates  — Update a DocumentTemplate
// ---------------------------------------------------------------------------
export const PUT = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const {
      id,
      name,
      display_name,
      description,
      header_text,
      body_text,
      footer_text,
      declaration,
      is_active,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID do modelo é obrigatório' },
        { status: 400 }
      );
    }

    const existing = await db.documentTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Modelo de documento não encontrado' },
        { status: 404 }
      );
    }

    // If name is being changed, check for uniqueness
    if (name && name !== existing.name) {
      const duplicate = await db.documentTemplate.findUnique({
        where: { name },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: 'Já existe um modelo com este nome' },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (display_name !== undefined) updateData.display_name = display_name;
    if (description !== undefined) updateData.description = description || null;
    if (header_text !== undefined) updateData.header_text = header_text || null;
    if (body_text !== undefined) updateData.body_text = body_text || null;
    if (footer_text !== undefined) updateData.footer_text = footer_text || null;
    if (declaration !== undefined) updateData.declaration = declaration || null;
    if (is_active !== undefined) updateData.is_active = is_active;

    await db.documentTemplate.update({
      where: { id },
      data: updateData,
    });

    const updated = await db.documentTemplate.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
      },
    });

    await logAction(req.user!.userId, 'update_document_template', `Modelo de documento atualizado: ${updated?.name ?? id}`, req);

    return NextResponse.json({ template: updated });
  } catch (error) {
    console.error('Update document template error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/document-templates  — Delete a DocumentTemplate
// ---------------------------------------------------------------------------
export const DELETE = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID do modelo é obrigatório' },
        { status: 400 }
      );
    }

    const existing = await db.documentTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Modelo de documento não encontrado' },
        { status: 404 }
      );
    }

    await db.documentTemplate.delete({
      where: { id },
    });

    await logAction(req.user!.userId, 'delete_document_template', `Modelo de documento excluído: ${existing.name}`, req);

    return NextResponse.json({ message: 'Modelo de documento excluído com sucesso' });
  } catch (error) {
    console.error('Delete document template error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
