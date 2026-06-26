import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { getUserSchoolIds, canUserAccessSchool } from '@/lib/user-schools';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Create a consistent UTC midnight Date from a date string like "2026-06-12".
 */
function toUTCDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

const BRAND_GREEN = [22, 163, 74] as [number, number, number];
const GRAY_TEXT = [120, 120, 120] as [number, number, number];

export const GET = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'excel';
    const student_id = searchParams.get('student_id') || '';
    const school_id = searchParams.get('school_id') || '';
    const date_from = searchParams.get('date_from') || '';
    const date_to = searchParams.get('date_to') || '';
    const status = searchParams.get('status') || '';

    const where: Record<string, unknown> = {};

    if (student_id) where.student_id = student_id;
    if (status) where.status = status;

    const dateFilter: Record<string, Date> = {};
    if (date_from) {
      dateFilter.gte = toUTCDate(date_from);
    }
    if (date_to) {
      const end = toUTCDate(date_to);
      end.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    if (Object.keys(dateFilter).length > 0) {
      where.date = dateFilter;
    }

    // ── School scoping (VULN-3 FIX) ──
    // Non-admins are restricted to their assigned schools.
    const allowedSchoolIds = await getUserSchoolIds(req.user!.userId, req.user!.role);

    if (allowedSchoolIds !== null) {
      // Non-admin
      if (student_id) {
        // Verify the requested student belongs to an allowed school.
        const scopedStudent = await db.student.findUnique({
          where: { id: student_id },
          select: { school_id: true },
        });
        const canAccessStudent =
          !!scopedStudent &&
          (await canUserAccessSchool(
            req.user!.userId,
            req.user!.role,
            scopedStudent.school_id
          ));
        if (!canAccessStudent) {
          return NextResponse.json(
            { error: 'Não encontrado' },
            { status: 404 }
          );
        }
        // Restrict to the student's school as a defense-in-depth measure.
        where.student = { school_id: scopedStudent.school_id };
      } else if (school_id) {
        if (!allowedSchoolIds.includes(school_id)) {
          return NextResponse.json(
            { error: 'Não encontrado' },
            { status: 404 }
          );
        }
        where.student = { school_id };
      } else {
        where.student = { school_id: { in: allowedSchoolIds } };
      }
    } else if (school_id) {
      // Admin explicitly filtering by school
      where.student = { school_id };
    }

    const records = await db.attendanceRecord.findMany({
      where,
      include: {
        student: {
          select: {
            full_name: true,
            class: true,
            grade: true,
            school: { select: { name: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 10000,
    });

    await logAction(req.user!.userId, 'export_report', `Exportação de frequência (${format})`, req);

    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Header bar
      doc.setFillColor(...BRAND_GREEN);
      doc.rect(0, 0, pageWidth, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text('Relatório de Frequência', 14, 18);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

      const tableData = records.map((r) => [
        r.student.full_name,
        r.student.school.name,
        r.student.grade || '-',
        r.student.class || '-',
        new Date(r.date).toLocaleDateString('pt-BR'),
        r.status === 'present' ? 'Presente' : 'Ausente',
      ]);

      autoTable(doc, {
        startY: 42,
        head: [['Aluno', 'Escola', 'Série', 'Turma', 'Data', 'Status']],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 251] as [number, number, number] },
        margin: { left: 14, right: 14 },
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_TEXT);
        doc.text(
          `NUCA Plataforma  |  Página ${i} de ${pageCount}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=frequencia.pdf',
        },
      });
    } else {
      // Excel
      const data = records.map((r) => ({
        Aluno: r.student.full_name,
        Escola: r.student.school.name,
        Série: r.student.grade || '-',
        Turma: r.student.class || '-',
        Data: new Date(r.date).toLocaleDateString('pt-BR'),
        Status: r.status === 'present' ? 'Presente' : 'Ausente',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Frequência');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename=frequencia.xlsx',
        },
      });
    }
  } catch (error) {
    console.error('Export attendance error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
