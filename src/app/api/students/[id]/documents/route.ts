import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { canUserAccessSchool } from '@/lib/user-schools';
import { logAction } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Valid enum values
// ---------------------------------------------------------------------------
const VALID_DOCUMENT_TYPES = [
  'birth_certificate',
  'residence_proof',
  'vaccination_card',
  'photo_3x4',
  'rg_copy',
  'cpf_copy',
  'medical_report',
  'enrollment_form',
  'income_proof',
  'other',
] as const;

const VALID_STATUSES = ['pending', 'delivered', 'verified'] as const;

type DocumentType = (typeof VALID_DOCUMENT_TYPES)[number];
type DocumentStatus = (typeof VALID_STATUSES)[number];

// ---------------------------------------------------------------------------
// GET /api/students/[id]/documents — List all documents for a student
// ---------------------------------------------------------------------------
export async function GET(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth(async (_req: AuthenticatedRequest) => {
    try {
      const { id: studentId } = await context.params;

      // Verify student exists and get school_id for access check
      const student = await db.student.findUnique({
        where: { id: studentId },
        select: { id: true, school_id: true },
      });

      if (!student) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // Non-admins can only view documents of students in schools they have access to
      const canAccess = await canUserAccessSchool(
        _req.user!.userId,
        _req.user!.role,
        student.school_id
      );
      if (!canAccess) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      const documents = await db.studentDocument.findMany({
        where: { student_id: studentId },
        include: {
          verifier: {
            select: { id: true, full_name: true },
          },
        },
        orderBy: { document_type: 'asc' },
      });

      return NextResponse.json({ documents });
    } catch (error) {
      console.error('List student documents error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

// ---------------------------------------------------------------------------
// POST /api/students/[id]/documents — Create or update a document record (upsert)
// ---------------------------------------------------------------------------
export async function POST(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin', 'Operator'], async (_req: AuthenticatedRequest) => {
    try {
      const { id: studentId } = await context.params;
      const body = await _req.json();

      const { document_type, status, notes } = body as {
        document_type?: string;
        status?: string;
        notes?: string;
      };

      // ── Validate required fields ──
      if (!document_type || !status) {
        return NextResponse.json(
          { error: 'Tipo de documento e status são obrigatórios' },
          { status: 400 }
        );
      }

      // ── Validate document_type ──
      if (!VALID_DOCUMENT_TYPES.includes(document_type as DocumentType)) {
        return NextResponse.json(
          { error: 'Tipo de documento inválido' },
          { status: 400 }
        );
      }

      // ── Validate status ──
      if (!VALID_STATUSES.includes(status as DocumentStatus)) {
        return NextResponse.json(
          { error: 'Status inválido' },
          { status: 400 }
        );
      }

      // ── Verify student exists and check school access ──
      const student = await db.student.findUnique({
        where: { id: studentId },
        select: { id: true, school_id: true, full_name: true },
      });

      if (!student) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      const canAccess = await canUserAccessSchool(
        _req.user!.userId,
        _req.user!.role,
        student.school_id
      );
      if (!canAccess) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // ── Build upsert data ──
      const deliveredAt =
        status === 'delivered' || status === 'verified' ? new Date() : null;
      const verifiedBy =
        status === 'verified' ? _req.user!.userId : null;

      // Neon HTTP adapter: upsert on unique constraint [student_id, document_type]
      const document = await db.studentDocument.upsert({
        where: {
          student_id_document_type: {
            student_id: studentId,
            document_type: document_type as string,
          },
        },
        update: {
          status: status as string,
          notes: notes ?? null,
          ...(deliveredAt !== null ? { delivered_at: deliveredAt } : {}),
          ...(verifiedBy !== null ? { verified_by: verifiedBy } : {}),
        },
        create: {
          student_id: studentId,
          document_type: document_type as string,
          status: status as string,
          notes: notes ?? null,
          ...(deliveredAt !== null ? { delivered_at: deliveredAt } : {}),
          ...(verifiedBy !== null ? { verified_by: verifiedBy } : {}),
        },
      });

      // Fetch with verifier relation separately (Neon HTTP adapter avoids
      // implicit transactions from create/upsert + include)
      const result = await db.studentDocument.findUnique({
        where: { id: document.id },
        include: {
          verifier: {
            select: { id: true, full_name: true },
          },
        },
      });

      await logAction(
        _req.user!.userId,
        'update_student_document',
        `Documento ${document_type} do aluno ${student.full_name} atualizado para ${status}`,
        _req
      );

      return NextResponse.json({ document: result });
    } catch (error) {
      console.error('Create/update student document error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

// ---------------------------------------------------------------------------
// PUT /api/students/[id]/documents — Update a document's status
// ---------------------------------------------------------------------------
export async function PUT(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin', 'Operator'], async (_req: AuthenticatedRequest) => {
    try {
      const { id: studentId } = await context.params;
      const body = await _req.json();

      const { document_type, status, notes } = body as {
        document_type?: string;
        status?: string;
        notes?: string;
      };

      // ── Validate required fields ──
      if (!document_type || !status) {
        return NextResponse.json(
          { error: 'Tipo de documento e status são obrigatórios' },
          { status: 400 }
        );
      }

      // ── Validate document_type ──
      if (!VALID_DOCUMENT_TYPES.includes(document_type as DocumentType)) {
        return NextResponse.json(
          { error: 'Tipo de documento inválido' },
          { status: 400 }
        );
      }

      // ── Validate status ──
      if (!VALID_STATUSES.includes(status as DocumentStatus)) {
        return NextResponse.json(
          { error: 'Status inválido' },
          { status: 400 }
        );
      }

      // ── Verify student exists and check school access ──
      const student = await db.student.findUnique({
        where: { id: studentId },
        select: { id: true, school_id: true, full_name: true },
      });

      if (!student) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      const canAccess = await canUserAccessSchool(
        _req.user!.userId,
        _req.user!.role,
        student.school_id
      );
      if (!canAccess) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // ── Verify existing document record ──
      const existing = await db.studentDocument.findUnique({
        where: {
          student_id_document_type: {
            student_id: studentId,
            document_type: document_type as string,
          },
        },
      });

      if (!existing) {
        return NextResponse.json(
          { error: 'Documento não encontrado' },
          { status: 404 }
        );
      }

      // ── Build update data ──
      const updateData: Record<string, unknown> = {
        status: status as string,
      };

      if (notes !== undefined) {
        updateData.notes = notes;
      }

      // Set delivered_at when status changes to delivered or verified
      if (status === 'delivered' || status === 'verified') {
        updateData.delivered_at = new Date();
      }

      // Set verified_by when status changes to verified
      if (status === 'verified') {
        updateData.verified_by = _req.user!.userId;
      }

      // If reverting to pending, clear delivered_at and verified_by
      if (status === 'pending') {
        updateData.delivered_at = null;
        updateData.verified_by = null;
      }

      await db.studentDocument.update({
        where: { id: existing.id },
        data: updateData,
      });

      // Fetch with verifier relation separately
      const result = await db.studentDocument.findUnique({
        where: { id: existing.id },
        include: {
          verifier: {
            select: { id: true, full_name: true },
          },
        },
      });

      await logAction(
        _req.user!.userId,
        'update_student_document',
        `Documento ${document_type} do aluno ${student.full_name} atualizado para ${status}`,
        _req
      );

      return NextResponse.json({ document: result });
    } catch (error) {
      console.error('Update student document error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

// ---------------------------------------------------------------------------
// DELETE /api/students/[id]/documents?document_type=xxx — Remove a document record
// ---------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id: studentId } = await context.params;
      const { searchParams } = new URL(_req.url);
      const documentType = searchParams.get('document_type');

      if (!documentType) {
        return NextResponse.json(
          { error: 'Parâmetro document_type é obrigatório' },
          { status: 400 }
        );
      }

      // ── Validate document_type ──
      if (!VALID_DOCUMENT_TYPES.includes(documentType as DocumentType)) {
        return NextResponse.json(
          { error: 'Tipo de documento inválido' },
          { status: 400 }
        );
      }

      // ── Verify student exists and check school access ──
      const student = await db.student.findUnique({
        where: { id: studentId },
        select: { id: true, school_id: true, full_name: true },
      });

      if (!student) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      const canAccess = await canUserAccessSchool(
        _req.user!.userId,
        _req.user!.role,
        student.school_id
      );
      if (!canAccess) {
        return NextResponse.json(
          { error: 'Aluno não encontrado' },
          { status: 404 }
        );
      }

      // ── Find and delete the document ──
      const existing = await db.studentDocument.findUnique({
        where: {
          student_id_document_type: {
            student_id: studentId,
            document_type: documentType,
          },
        },
      });

      if (!existing) {
        return NextResponse.json(
          { error: 'Documento não encontrado' },
          { status: 404 }
        );
      }

      await db.studentDocument.delete({
        where: { id: existing.id },
      });

      await logAction(
        _req.user!.userId,
        'delete_student_document',
        `Documento ${documentType} do aluno ${student.full_name} removido`,
        _req
      );

      return NextResponse.json({ message: 'Documento removido com sucesso' });
    } catch (error) {
      console.error('Delete student document error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req as AuthenticatedRequest, context);
}
