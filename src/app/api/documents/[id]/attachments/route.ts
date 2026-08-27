import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ─── GET: List attachments (metadata only, no base64 data) ───
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

    const attachments = await db.docManagementAttachment.findMany({
      where: { document_id: id },
      select: {
        id: true,
        file_name: true,
        file_type: true,
        file_size: true,
        uploaded_by: true,
        uploaded_at: true,
        // Do NOT include file_data (base64) — too large for listing
      },
      orderBy: { uploaded_at: 'desc' },
    });

    // Include uploader info
    const attachmentsWithUploader = await Promise.all(
      attachments.map(async (att) => {
        const uploader = await db.user.findUnique({
          where: { id: att.uploaded_by },
          select: { id: true, full_name: true },
        });
        return {
          ...att,
          uploader,
        };
      })
    );

    return NextResponse.json({ attachments: attachmentsWithUploader });
  } catch (error) {
    console.error('Error listing attachments:', error);
    return NextResponse.json(
      { error: 'Erro ao listar anexos' },
      { status: 500 }
    );
  }
});

// ─── POST: Upload attachment ───
export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest, context?: { params: Promise<Record<string, string>> }) => {
  try {
    if (!context?.params) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    const { id } = await context.params;
    const userId = req.user!.userId;

    const document = await db.docManagementDocument.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Documento não encontrado' },
        { status: 404 }
      );
    }

    // Only allow uploading attachments if document status allows editing
    // (must match the DELETE handler's guard for consistency)
    const editableStatuses = ['draft', 'generated'];
    if (!editableStatuses.includes(document.status)) {
      return NextResponse.json(
        { error: 'Anexos só podem ser adicionados a documentos em rascunho ou gerado' },
        { status: 400 }
      );
    }

    // Parse FormData
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Arquivo não fornecido' },
        { status: 400 }
      );
    }

    // ─── File size validation (max 10 MB) ───
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Tamanho máximo: 10 MB.' },
        { status: 413 }
      );
    }

    // ─── File type validation (whitelist of allowed types) ───
    const ALLOWED_MIME_TYPES = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'text/plain',
      'text/csv',
    ];

    // Validate MIME type if provided; also validate extension as fallback
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.txt', '.csv'];
    const fileExt = '.' + (file.name.split('.').pop() || '').toLowerCase();

    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não permitido. Use: PDF, imagens, documentos Office, ZIP, TXT ou CSV.' },
        { status: 415 }
      );
    }

    if (!allowedExtensions.includes(fileExt)) {
      return NextResponse.json(
        { error: 'Extensão de arquivo não permitida. Use: PDF, imagens, documentos Office, ZIP, TXT ou CSV.' },
        { status: 415 }
      );
    }

    // ─── Sanitize filename (prevent path traversal, remove dangerous chars) ───
    const safeFileName = file.name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // remove dangerous chars
      .replace(/\.\./g, '_')                   // prevent path traversal
      .substring(0, 255);                      // limit length

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');

    // Create attachment
    const attachment = await db.docManagementAttachment.create({
      data: {
        document_id: id,
        file_name: safeFileName,
        file_type: file.type,
        file_size: file.size,
        file_data: base64Data,
        uploaded_by: userId,
      },
    });

    // Create history entry
    await db.docManagementHistory.create({
      data: {
        document_id: id,
        user_id: userId,
        action: 'attachment_added',
        description: `Anexo "${safeFileName}" adicionado (${(file.size / 1024).toFixed(1)} KB)`,
      },
    });

    await logAction(userId, 'add_attachment_doc_management', `Anexo "${safeFileName}" adicionado ao documento ${document.number_formatted}`);

    // Return metadata only (not the base64 data)
    return NextResponse.json({
      attachment: {
        id: attachment.id,
        file_name: attachment.file_name,
        file_type: attachment.file_type,
        file_size: attachment.file_size,
        uploaded_at: attachment.uploaded_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    return NextResponse.json(
      { error: 'Erro ao upload anexo' },
      { status: 500 }
    );
  }
});

// ─── DELETE: Delete a specific attachment by ID ───
export const DELETE = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest, context?: { params: Promise<Record<string, string>> }) => {
  try {
    if (!context?.params) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    const { id } = await context.params;
    const userId = req.user!.userId;

    const { searchParams } = new URL(req.url);
    const attachmentId = searchParams.get('attachment_id');

    if (!attachmentId) {
      return NextResponse.json(
        { error: 'ID do anexo não fornecido' },
        { status: 400 }
      );
    }

    const document = await db.docManagementDocument.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Documento não encontrado' },
        { status: 404 }
      );
    }

    // Only allow deleting attachments if document status allows editing
    const editableStatuses = ['draft', 'generated'];
    if (!editableStatuses.includes(document.status)) {
      return NextResponse.json(
        { error: 'Anexos só podem ser removidos de documentos em rascunho ou gerado' },
        { status: 400 }
      );
    }

    const attachment = await db.docManagementAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.document_id !== id) {
      return NextResponse.json(
        { error: 'Anexo não encontrado' },
        { status: 404 }
      );
    }

    // Delete the attachment
    await db.docManagementAttachment.delete({
      where: { id: attachmentId },
    });

    // Create history entry
    await db.docManagementHistory.create({
      data: {
        document_id: id,
        user_id: userId,
        action: 'edited',
        description: `Anexo "${attachment.file_name}" removido`,
      },
    });

    await logAction(userId, 'delete_attachment_doc_management', `Anexo "${attachment.file_name}" removido do documento ${document.number_formatted}`);

    return NextResponse.json({ message: 'Anexo removido com sucesso' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    return NextResponse.json(
      { error: 'Erro ao remover anexo' },
      { status: 500 }
    );
  }
});
