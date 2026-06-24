import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';
import { logAction } from '@/lib/logger';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PDF generation can take a moment for large schools — give it headroom on Vercel.
export const maxDuration = 30;

const BRAND_GREEN: [number, number, number] = [22, 163, 74];
const GRAY_TEXT: [number, number, number] = [120, 120, 120];
const LIGHT_GRAY: [number, number, number] = [243, 244, 246];

/**
 * GET /api/attendance/sheet?school_id=...&date=YYYY-MM-DD[&class=...&grade=...]
 *
 * Generates a printable PDF "signature sheet" (folha de frequência manual):
 * each student's name is listed with a wide blank column next to it where the
 * student signs by hand on a printed copy. This is intentionally a manual /
 * offline attendance method — it does NOT read or write attendance records.
 *
 * Available to all authenticated users (Admin, Operator, Viewer). Non-admins
 * are scoped to the schools they can access.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const school_id = searchParams.get('school_id') || '';
    const dateStr = searchParams.get('date') || '';
    const classFilter = searchParams.get('class') || '';
    const gradeFilter = searchParams.get('grade') || '';

    if (!school_id) {
      return NextResponse.json(
        { error: 'Selecione uma escola' },
        { status: 400 }
      );
    }
    if (!dateStr) {
      return NextResponse.json(
        { error: 'Selecione uma data' },
        { status: 400 }
      );
    }

    // ── School scoping (non-admins restricted to their schools) ──
    const allowedSchoolIds = await getUserSchoolIds(req.user!.userId, req.user!.role);
    if (allowedSchoolIds !== null && !allowedSchoolIds.includes(school_id)) {
      return NextResponse.json(
        { error: 'Você não tem acesso a esta escola' },
        { status: 403 }
      );
    }

    // ── Load school + students ──
    const school = await db.school.findUnique({
      where: { id: school_id },
      select: { id: true, name: true },
    });

    if (!school) {
      return NextResponse.json(
        { error: 'Escola não encontrada' },
        { status: 404 }
      );
    }

    const studentWhere: Record<string, unknown> = {
      school_id,
      status: 'active',
    };
    if (classFilter) studentWhere.class = classFilter;
    if (gradeFilter) studentWhere.grade = gradeFilter;

    const students = await db.student.findMany({
      where: studentWhere,
      select: { id: true, full_name: true, class: true, grade: true },
      orderBy: { full_name: 'asc' },
    });

    if (students.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum aluno ativo encontrado para os filtros selecionados' },
        { status: 404 }
      );
    }

    // ── Format date for display (pt-BR) ──
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateDisplay = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

    // ── Build the PDF ──
    // A4 portrait, units in mm. Portrait gives us a tall page with a wide
    // signature column on the right — ideal for handwriting.
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();   // 210mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
    const margin = 14; // mm

    // ── Header bar (brand green) ──
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, pageWidth, 22, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Lista de Frequência', margin, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('NUCA Plataforma · Folha de Assinatura Manual', margin, 18);

    // Date on the right side of the header
    doc.setFontSize(10);
    doc.text(`Data: ${dateDisplay}`, pageWidth - margin, 12, { align: 'right' });

    // ── Info block (school / class / grade / period / teacher) ──
    let y = 30;
    const labelGap = 4; // space between label and the underline

    // Helper: draws "Label: _______" with an underline field
    const drawField = (
      label: string,
      value: string,
      x: number,
      fieldWidth: number
    ) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text(label, x, y);
      const labelWidth = doc.getTextWidth(label);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      if (value) {
        doc.text(value, x + labelWidth + 1, y);
      }

      // Underline for the field
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      const lineX = x + labelWidth + (value ? doc.getTextWidth(value) + 1 : labelGap);
      doc.line(lineX, y + 1, x + fieldWidth, y + 1);
    };

    // Row 1: Escola (full width) + Período
    drawField('Escola:', school.name, margin, pageWidth / 2 - margin - 10);
    drawField('Período:', '', pageWidth / 2 + 5, pageWidth / 2 - margin - 5);
    y += 8;

    // Row 2: Turma + Série
    drawField(
      'Turma:',
      classFilter || '',
      margin,
      pageWidth / 2 - margin - 10
    );
    drawField(
      'Série:',
      gradeFilter || '',
      pageWidth / 2 + 5,
      pageWidth / 2 - margin - 5
    );
    y += 8;

    // Row 3: Professor(a) — full width field
    drawField('Professor(a):', '', margin, pageWidth - margin * 2);
    y += 6;

    // ── Students table (the signature sheet itself) ──
    // Columns: Nº | Nome do Aluno | Assinatura
    // The Assinatura column is the widest so there's real room to sign.
    const tableStartY = y;

    const body = students.map((s, i) => [
      String(i + 1),
      s.full_name,
      '', // blank — student signs here
    ]);

    autoTable(doc, {
      startY: tableStartY,
      head: [['Nº', 'Nome do Aluno', 'Assinatura']],
      body,
      theme: 'grid',
      margin: { left: margin, right: margin, bottom: 18 },
      // Column widths must sum to (pageWidth - 2*margin) = 182mm
      columnStyles: {
        0: { cellWidth: 12, halign: 'center', valign: 'middle' },
        1: { cellWidth: 70 },
        2: { cellWidth: 100 }, // wide blank column for the signature
      },
      styles: {
        font: 'helvetica',
        fontSize: 10,
        cellPadding: 2,
        lineColor: [200, 200, 200],
        lineWidth: 0.2,
        // Tall rows so there's vertical room to sign comfortably.
        minCellHeight: 14,
        valign: 'middle',
      },
      headStyles: {
        fillColor: BRAND_GREEN,
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: 'bold',
        fontSize: 10,
        halign: 'center',
        minCellHeight: 9,
      },
      alternateRowStyles: {
        fillColor: LIGHT_GRAY,
      },
      didDrawCell: () => {
        // No-op: the blank Assinatura cells render as empty boxes by default,
        // which is exactly what we want (a blank space to sign).
      },
    });

    // ── Footer (page numbers) on every page ──
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_TEXT);
      doc.text(
        `NUCA Plataforma  ·  Folha de Assinatura Manual  ·  ${dateDisplay}  ·  Página ${i} de ${pageCount}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
      );
    }

    // ── Audit log ──
    await logAction(
      req.user!.userId,
      'export_report',
      `Geração de folha de assinatura (PDF): escola=${school.name}, data=${dateDisplay}, alunos=${students.length}`,
      req
    );

    // ── Return as a downloadable PDF ──
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    // Filename: folha-assinatura_{school-slug}_{date}.pdf
    const schoolSlug = school.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'escola';

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="folha-assinatura_${schoolSlug}_${dateStr}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Attendance sheet error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor ao gerar folha de assinatura' },
      { status: 500 }
    );
  }
});
