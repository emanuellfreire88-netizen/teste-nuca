import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';
import { logAction } from '@/lib/logger';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PDF generation can take a moment for large schools — give it headroom on Vercel.
export const maxDuration = 30;

// ── Color palette (matching the uploaded NUCA template) ──────────────────────
const NAVY: [number, number, number] = [13, 71, 161];
const ROYAL_BLUE: [number, number, number] = [0, 113, 197];
const SKY_BLUE: [number, number, number] = [0, 191, 255];
const ORANGE: [number, number, number] = [255, 140, 0];
const GOLD: [number, number, number] = [255, 193, 7];
const DARK_TEXT: [number, number, number] = [40, 40, 40];

// Load the NUCA logo PNG once at module init so we don't read from disk on
// every request.
let NUCA_LOGO_B64: string | null = null;
try {
  const logoPath = path.join(process.cwd(), 'public', 'uploads', 'nuca-logo.png');
  if (fs.existsSync(logoPath)) {
    NUCA_LOGO_B64 = fs.readFileSync(logoPath).toString('base64');
  }
} catch (err) {
  console.warn('[attendance/sheet] NUCA logo not found, falling back to text:', err);
}

/**
 * GET /api/attendance/sheet?school_id=...&date=YYYY-MM-DD[&class=...&grade=...]
 *
 * Generates a printable PDF "signature sheet" (folha de frequência manual)
 * styled after the NUCA institutional document template.
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

    // ════════════════════════════════════════════════════════════════════════
    // TOP WAVES — orange + sky-blue layered bezier curves
    // ════════════════════════════════════════════════════════════════════════
    const topWaveHeight = 30; // mm — total height of the wave region

    // Orange wave (back layer) — flowing curve from top-left, dipping down to
    // the right.
    doc.setFillColor(...ORANGE);
    doc.moveTo(0, 0);
    doc.curveTo(
      pageWidth * 0.35, topWaveHeight * 1.4,    // control point 1
      pageWidth * 0.7, -topWaveHeight * 0.3,    // control point 2
      pageWidth, topWaveHeight * 0.55           // end point
    );
    doc.lineTo(pageWidth, 0);
    doc.lineTo(0, 0);
    doc.close();
    doc.fill();

    // Sky-blue wave (front layer) — sits below the orange, creating depth.
    doc.setFillColor(...SKY_BLUE);
    doc.moveTo(0, topWaveHeight * 0.5);
    doc.curveTo(
      pageWidth * 0.3, topWaveHeight * 1.5,
      pageWidth * 0.65, topWaveHeight * 0.2,
      pageWidth, topWaveHeight * 0.95
    );
    doc.lineTo(pageWidth, 0);
    doc.lineTo(0, 0);
    doc.lineTo(0, topWaveHeight * 0.5);
    doc.close();
    doc.fill();

    // Royal-blue thin accent line under the waves
    doc.setDrawColor(...ROYAL_BLUE);
    doc.setLineWidth(0.6);
    doc.line(0, topWaveHeight + 1, pageWidth, topWaveHeight + 1);

    // ════════════════════════════════════════════════════════════════════════
    // TITLE BLOCK — on the left, over the wave area
    // ════════════════════════════════════════════════════════════════════════
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Lista de Frequência', margin, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Folha de Assinatura Manual', margin, 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Data: ${dateDisplay}`, margin, 24);

    // ════════════════════════════════════════════════════════════════════════
    // NUCA LOGO — top-right corner
    // ════════════════════════════════════════════════════════════════════════
    const logoW = 36;
    const logoH = 36 * (1080 / 1920); // ≈20.25mm — keep aspect ratio
    const logoX = pageWidth - margin - logoW;
    const logoY = 5;
    if (NUCA_LOGO_B64) {
      try {
        doc.addImage(
          `data:image/png;base64,${NUCA_LOGO_B64}`,
          'PNG',
          logoX, logoY,
          logoW, logoH,
          undefined,
          'FAST'
        );
      } catch (imgErr) {
        console.warn('[attendance/sheet] Failed to embed NUCA logo:', imgErr);
        drawTextLogo(doc, logoX - 12, logoY + 3);
      }
    } else {
      drawTextLogo(doc, logoX - 12, logoY + 3);
    }

    // ════════════════════════════════════════════════════════════════════════
    // INFO FIELDS — Escola / Período / Turma / Série / Professor
    // ════════════════════════════════════════════════════════════════════════
    let y = topWaveHeight + 9;
    const labelGap = 3;

    const drawField = (
      label: string,
      value: string,
      x: number,
      fieldWidth: number
    ) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...NAVY);
      doc.text(label, x, y);
      const labelWidth = doc.getTextWidth(label);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_TEXT);
      if (value) {
        doc.text(value, x + labelWidth + 1, y);
      }

      doc.setDrawColor(...ROYAL_BLUE);
      doc.setLineWidth(0.3);
      const lineX = x + labelWidth + (value ? doc.getTextWidth(value) + 1 : labelGap);
      doc.line(lineX, y + 1, x + fieldWidth, y + 1);
    };

    // Row 1: Escola + Período
    drawField('Escola:', school.name, margin, pageWidth / 2 - margin - 10);
    drawField('Período:', '', pageWidth / 2 + 5, pageWidth / 2 - margin - 5);
    y += 8;

    // Row 2: Turma + Série
    drawField('Turma:', classFilter || '', margin, pageWidth / 2 - margin - 10);
    drawField('Série:', gradeFilter || '', pageWidth / 2 + 5, pageWidth / 2 - margin - 5);
    y += 8;

    // Row 3: Professor(a) — full width
    drawField('Professor(a):', '', margin, pageWidth - margin * 2);
    y += 5;

    // ════════════════════════════════════════════════════════════════════════
    // STUDENTS TABLE
    // ════════════════════════════════════════════════════════════════════════
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
      margin: { left: margin, right: margin, bottom: 42 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center', valign: 'middle' },
        1: { cellWidth: 70 },
        2: { cellWidth: 100 },
      },
      styles: {
        font: 'helvetica',
        fontSize: 10,
        cellPadding: 2,
        lineColor: [210, 210, 210],
        lineWidth: 0.2,
        minCellHeight: 14,
        valign: 'middle',
        textColor: DARK_TEXT,
      },
      headStyles: {
        fillColor: ROYAL_BLUE,
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: 'bold',
        fontSize: 10,
        halign: 'center',
        minCellHeight: 9,
      },
      didDrawCell: () => {},
    });

    // ════════════════════════════════════════════════════════════════════════
    // BOTTOM WAVES + INSTITUTIONAL SEALS — on every page
    // ════════════════════════════════════════════════════════════════════════
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      const bottomWaveHeight = 26;
      const waveTop = pageHeight - bottomWaveHeight;

      // Sky-blue wave (back layer)
      doc.setFillColor(...SKY_BLUE);
      doc.moveTo(0, pageHeight);
      doc.curveTo(
        pageWidth * 0.3, waveTop + bottomWaveHeight * 0.3,
        pageWidth * 0.7, waveTop - bottomWaveHeight * 0.5,
        pageWidth, waveTop + 2
      );
      doc.lineTo(pageWidth, pageHeight);
      doc.lineTo(0, pageHeight);
      doc.close();
      doc.fill();

      // Orange wave (front layer)
      doc.setFillColor(...ORANGE);
      doc.moveTo(0, pageHeight);
      doc.curveTo(
        pageWidth * 0.25, waveTop + bottomWaveHeight * 0.4,
        pageWidth * 0.6, waveTop - bottomWaveHeight * 0.2,
        pageWidth, waveTop + 6
      );
      doc.lineTo(pageWidth, pageHeight);
      doc.lineTo(0, pageHeight);
      doc.close();
      doc.fill();

      // Royal-blue accent line above the waves
      doc.setDrawColor(...ROYAL_BLUE);
      doc.setLineWidth(0.6);
      doc.line(0, waveTop - 1, pageWidth, waveTop - 1);

      // ── Institutional seals (bottom-left, on top of the waves) ──
      drawUnicefSeal(doc, margin + 9, waveTop + bottomWaveHeight / 2);
      drawMunicipioAprovadoSeal(doc, margin + 9 + 22, waveTop + bottomWaveHeight / 2);

      // ── Page footer (right side, over the wave area) ──
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(
        `NUCA Plataforma · ${dateDisplay} · Página ${i} de ${pageCount}`,
        pageWidth - margin,
        pageHeight - 6,
        { align: 'right' }
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

/**
 * Draws the Selo UNICEF as a filled royal-blue circle with white text.
 * (x, y) is the center of the seal; radius is 10mm.
 */
function drawUnicefSeal(doc: jsPDF, x: number, y: number) {
  const r = 10;
  // Outer blue circle
  doc.setFillColor(...ROYAL_BLUE);
  doc.circle(x, y, r, 'F');
  // Thin white ring inside
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.6);
  doc.circle(x, y, r - 1.2, 'S');
  // Text
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('SELO', x, y - 3, { align: 'center' });
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('UNICEF', x, y + 0.5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('25', x, y + 4.5, { align: 'center' });
}

/**
 * Draws the "Município Aprovado" seal as a filled gold circle with black text.
 * (x, y) is the center of the seal; radius is 10mm.
 */
function drawMunicipioAprovadoSeal(doc: jsPDF, x: number, y: number) {
  const r = 10;
  // Outer gold circle
  doc.setFillColor(...GOLD);
  doc.circle(x, y, r, 'F');
  // Thin dark ring inside
  doc.setDrawColor(120, 90, 0);
  doc.setLineWidth(0.5);
  doc.circle(x, y, r - 1.2, 'S');
  // Text
  doc.setTextColor(40, 30, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.text('MUNICÍPIO', x, y - 3, { align: 'center' });
  doc.text('APROVADO', x, y + 0.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('2013-2016', x, y + 4.5, { align: 'center' });
}

/**
 * Fallback text logo if the PNG can't be embedded.
 * Draws "NUCA" with each letter in a different brand color, plus subtitle.
 */
function drawTextLogo(doc: jsPDF, x: number, y: number) {
  const letterW = 6;
  const colors: [number, number, number][] = [
    [0, 166, 81],   // N - green
    [255, 204, 0],  // U - yellow
    [0, 113, 197],  // C - blue
    [255, 140, 0],  // A - orange
  ];
  const letters = ['N', 'U', 'C', 'A'];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  letters.forEach((letter, i) => {
    doc.setTextColor(...colors[i]);
    doc.text(letter, x + i * letterW, y + 4);
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...ROYAL_BLUE);
  doc.text('NÚCLEO DE CIDADANIA', x, y + 8);
  doc.text('DE ADOLESCENTES', x, y + 11);
  doc.setFontSize(5);
  doc.setTextColor(...SKY_BLUE);
  doc.text('LIMOEIRO DE ANADIA - AL', x, y + 14);
}
