import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';
import { logAction } from '@/lib/logger';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ATTENDANCE_SHEET_TEMPLATE_PNG_BASE64 } from '@/lib/attendance-sheet-template';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PDF generation can take a moment for large schools — give it headroom on Vercel.
export const maxDuration = 30;

// ── Color palette (matching the NUCA institutional brand) ────────────────────
const NAVY: [number, number, number] = [13, 71, 161];
const ROYAL_BLUE: [number, number, number] = [0, 113, 197];
const SKY_BLUE: [number, number, number] = [0, 191, 255];
const ORANGE: [number, number, number] = [255, 140, 0];
const DARK_TEXT: [number, number, number] = [40, 40, 40];
const LIGHT_GRAY: [number, number, number] = [248, 248, 248];

/**
 * GET /api/attendance/sheet?school_id=...&date=YYYY-MM-DD[&class=...&grade=...]
 *
 * Generates a printable PDF "signature sheet" (folha de frequência manual)
 * using the user-provided NUCA institutional template as a full-page A4
 * portrait background, with the variable content (title, school info, and
 * the student signature table) overlaid on top — same approach used for the
 * certificate PDF.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const school_id = searchParams.get('school_id') || '';
    const dateStr = searchParams.get('date') || '';
    const classFilter = searchParams.get('class') || '';
    const gradeFilter = searchParams.get('grade') || '';

    if (!school_id) {
      return NextResponse.json({ error: 'Selecione uma escola' }, { status: 400 });
    }
    if (!dateStr) {
      return NextResponse.json({ error: 'Selecione uma data' }, { status: 400 });
    }

    // ── School scoping ──
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
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();   // 210mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
    const margin = 14;

    // Layout constants — tuned to the template's empty zones:
    //   TITLE_Y          — main title "FOLHA DE ASSINATURA"
    //   SUBTITLE_Y       — subtitle line under the title
    //   INFO_FIELDS_Y    — Escola / Data / Turma / Série / Professor block
    //   TABLE_START_Y    — first page: table begins here
    //   TABLE_TOP_MARGIN — pages 2+: autoTable uses this as the top margin
    //   BOTTOM_RESERVE   — bottom waves + small seals region (do not cover)
    const TITLE_Y = 48;
    const SUBTITLE_Y = 55;
    const INFO_FIELDS_Y = 64;
    const TABLE_START_Y = 88;
    const TABLE_TOP_MARGIN = 42;
    const BOTTOM_RESERVE = 40;

    /**
     * Paints the template background on the CURRENT page, then overlays the
     * title + subtitle (always) so every page has a consistent header.
     * Page-1-only elements (info fields) are drawn separately.
     */
    const drawPageBackground = () => {
      // ── 1. Full-page background image (the NUCA template) ──
      try {
        doc.addImage(
          ATTENDANCE_SHEET_TEMPLATE_PNG_BASE64,
          'PNG',
          0,
          0,
          pageWidth,
          pageHeight,
          undefined,
          'FAST'
        );
      } catch (imgErr) {
        // Fallback: plain white background so the sheet still generates.
        console.warn('[attendance/sheet] Template image embed failed:', imgErr);
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
      }

      // ── 2. Title block — placed in the narrow band between the top waves
      // and the central hexagonal UNICEF seal. White text would clash with
      // the white page background here, so we use the brand navy with a
      // subtle drop shadow for legibility.
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(...NAVY);
      doc.text('FOLHA DE ASSINATURA', pageWidth / 2, TITLE_Y, { align: 'center' });

      // Subtitle: contextual label
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...ROYAL_BLUE);
      doc.text('Lista de Frequência Manual', pageWidth / 2, SUBTITLE_Y, {
        align: 'center',
      });

      // Thin royal-blue divider under the subtitle, anchored to margins
      doc.setDrawColor(...ROYAL_BLUE);
      doc.setLineWidth(0.4);
      doc.line(margin, SUBTITLE_Y + 3, pageWidth - margin, SUBTITLE_Y + 3);

      // Tiny orange accent under the divider (brand detail)
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(0.8);
      doc.line(
        pageWidth / 2 - 12,
        SUBTITLE_Y + 4.5,
        pageWidth / 2 + 12,
        SUBTITLE_Y + 4.5
      );
    };

    /**
     * Draws the info fields (Escola / Data / Turma / Série / Professor) as a
     * clean two-column grid below the title. Only on page 1.
     * Returns the Y position after the fields.
     */
    const drawInfoFields = (startY: number) => {
      let y = startY;
      const rowH = 7;
      const colGap = 6;
      const colW = (pageWidth - margin * 2 - colGap) / 2;

      const drawField = (
        label: string,
        value: string,
        x: number,
        width: number
      ) => {
        // Label (bold, brand navy)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...NAVY);
        doc.text(label, x, y);
        const labelW = doc.getTextWidth(label);

        // Value (regular, dark gray) — truncated with ellipsis if too long
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...DARK_TEXT);
        const valueX = x + labelW + 1.5;
        const valueMaxW = width - labelW - 2;
        let truncated = value;
        if (doc.getTextWidth(value) > valueMaxW) {
          truncated = value + '…';
          while (
            truncated.length > 1 &&
            doc.getTextWidth(truncated) > valueMaxW
          ) {
            truncated = truncated.slice(0, -2) + '…';
          }
        }
        doc.text(truncated, valueX, y);

        // Underline (royal-blue, thin) filling the remaining column width
        const lineStartX =
          valueX + (truncated ? doc.getTextWidth(truncated) + 1 : 0);
        doc.setDrawColor(...ROYAL_BLUE);
        doc.setLineWidth(0.25);
        doc.line(lineStartX, y + 1, x + width, y + 1);
      };

      // Row 1: Escola (left, wide) + Data (right, narrow)
      drawField('Escola:', school.name, margin, colW);
      drawField('Data:', dateDisplay, margin + colW + colGap, colW);
      y += rowH;

      // Row 2: Turma + Série
      drawField('Turma:', classFilter || '—', margin, colW);
      drawField('Série:', gradeFilter || '—', margin + colW + colGap, colW);
      y += rowH;

      // Row 3: Professor(a) — full width
      drawField('Professor(a):', '', margin, pageWidth - margin * 2);
      y += 4;

      return y;
    };

    // ── Page 1 background + info fields are drawn inside the chunks loop
    // below (chunkIdx === 0 branch) so the painting order is consistent
    // across all pages: background → info fields → table.

    // ════════════════════════════════════════════════════════════════════════
    // STUDENTS TABLE — manual pagination
    //
    //   The central hexagonal UNICEF seal of the template sits in the middle
    //   of the page. To keep the signature sheet functional, the table is
    //   drawn with solid-white cell backgrounds so the seal is masked where
    //   the table covers it. The seal remains visible at the table's edges
    //   (if the table is short) and is fully visible above and below the
    //   table area on every page.
    //
    //   We pre-paginate the students manually (instead of relying on
    //   autoTable's auto-pagination) because we need to paint the full-page
    //   background BEFORE the table on every page — autoTable's didDrawPage
    //   hook fires AFTER the table is drawn, which would cover the table.
    // ════════════════════════════════════════════════════════════════════════
    const ROW_HEIGHT = 14; // mm — matches styles.minCellHeight
    const HEADER_ROW_HEIGHT = 10;
    const PAGE1_TABLE_AREA =
      pageHeight - TABLE_START_Y - BOTTOM_RESERVE - HEADER_ROW_HEIGHT;
    const PAGEN_TABLE_AREA =
      pageHeight - TABLE_TOP_MARGIN - BOTTOM_RESERVE - HEADER_ROW_HEIGHT;
    const ROWS_PAGE1 = Math.max(1, Math.floor(PAGE1_TABLE_AREA / ROW_HEIGHT));
    const ROWS_PAGEN = Math.max(1, Math.floor(PAGEN_TABLE_AREA / ROW_HEIGHT));

    // Split students into page-sized chunks
    const chunks: typeof students[] = [];
    let cursor = 0;
    while (cursor < students.length) {
      const isFirst = chunks.length === 0;
      const size = isFirst ? ROWS_PAGE1 : ROWS_PAGEN;
      chunks.push(students.slice(cursor, cursor + size));
      cursor += size;
    }

    let runningIndex = 0; // global student index across all pages

    chunks.forEach((chunk, chunkIdx) => {
      if (chunkIdx > 0) doc.addPage();

      // 1. Paint the full-page template background on the current page.
      drawPageBackground();

      // 2. Info fields only on page 1
      if (chunkIdx === 0) drawInfoFields(INFO_FIELDS_Y);

      // 3. Build this chunk's table rows (continue global numbering)
      const body = chunk.map((s) => {
        runningIndex += 1;
        return [String(runningIndex), s.full_name, ''];
      });

      // 4. Draw the table for this chunk. startY differs between page 1
      //    (after info fields) and pages 2+ (just below the title).
      const startY = chunkIdx === 0 ? TABLE_START_Y : TABLE_TOP_MARGIN;

      autoTable(doc, {
        startY,
        head: [['Nº', 'Nome do Aluno', 'Assinatura']],
        body,
        theme: 'grid',
        // No horizontal margins override here — startY handles the top.
        margin: { left: margin, right: margin, bottom: BOTTOM_RESERVE },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center', valign: 'middle' },
          1: { cellWidth: 70 },
          2: { cellWidth: 100 },
        },
        styles: {
          font: 'helvetica',
          fontSize: 10,
          cellPadding: 3,
          lineColor: [210, 210, 210],
          lineWidth: 0.2,
          minCellHeight: ROW_HEIGHT,
          valign: 'middle',
          textColor: DARK_TEXT,
          fillColor: [255, 255, 255], // solid white — masks the seal underneath
        },
        headStyles: {
          fillColor: NAVY,
          textColor: [255, 255, 255] as [number, number, number],
          fontStyle: 'bold',
          fontSize: 10,
          halign: 'center',
          minCellHeight: 9,
        },
        alternateRowStyles: {
          fillColor: LIGHT_GRAY, // very subtle zebra stripe for readability
        },
        // No didDrawPage — we already painted the background before this call.
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // PAGE FOOTER — small, discreet, on every page
    //   Placed in the narrow band ABOVE the bottom waves so we don't cover
    //   the institutional seals (UNICEF + Município Aprovado) at the very
    //   bottom of the template.
    // ════════════════════════════════════════════════════════════════════════
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      // Place the footer label just above the bottom decorative band, in a
      // safe horizontal position (right-aligned, away from the bottom seals
      // which are on the left side of the template).
      const footerY = pageHeight - BOTTOM_RESERVE + 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `NUCA · ${dateDisplay} · Página ${i} de ${pageCount}`,
        pageWidth - margin,
        footerY,
        { align: 'right' }
      );

      // Small sky-blue accent dot to the left of the footer text — brand detail
      doc.setFillColor(...SKY_BLUE);
      doc.circle(pageWidth - margin - 38, footerY - 0.5, 0.6, 'F');
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

// ── Helpers ──────────────────────────────────────────────────────────────────
// (Truncation logic is inlined in drawField above — uses the live `doc`
// instance for text-width measurement, which is more accurate than recreating
// a separate jsPDF for measurement.)
