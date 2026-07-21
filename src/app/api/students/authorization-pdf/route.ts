import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { seedDefaultTemplates } from '@/lib/seed-templates';
import jsPDF from 'jspdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// ── NUCA brand colors ──────────────────────────────────────────────────────
const ORANGE: [number, number, number] = [247, 148, 29];       // #F7941D
const CYAN: [number, number, number] = [41, 171, 226];         // #29ABE2
const BLUE: [number, number, number] = [0, 114, 206];          // #0072CE
const BLUE_DARK: [number, number, number] = [0, 94, 184];      // #005EB8
const ICE_BG: [number, number, number] = [230, 240, 250];      // #E6F0FA
const DARK_TEXT: [number, number, number] = [40, 50, 70];       // #283246
const MID_GRAY: [number, number, number] = [120, 130, 145];    // #788291
const LIGHT_LINE: [number, number, number] = [200, 215, 235];  // #C8D7EB
const WHITE: [number, number, number] = [255, 255, 255];

/**
 * POST /api/students/authorization-pdf
 *
 * Generates a trip authorization PDF ("Autorização de Saída para Passeio")
 * for one or more students. Design follows NUCA institutional template
 * with wave decorations and colorful branding.
 * Requires Admin or Operator role.
 */
export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const {
      student_ids,
      event_title,
      event_date,
      event_location,
      departure_time,
      return_time,
      responsible_name,
      observations,
      template_id,
      calendar_event_id,
      calendar_event_source,
    } = body as {
      student_ids: string[];
      event_title: string;
      event_date: string;
      event_location: string;
      departure_time?: string;
      return_time?: string;
      responsible_name?: string;
      observations?: string;
      template_id?: string;
      calendar_event_id?: string;
      calendar_event_source?: string;
    };

    // ── Validation ──
    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return NextResponse.json(
        { error: 'Informe ao menos um aluno' },
        { status: 400 }
      );
    }
    if (!event_title || !event_date || !event_location) {
      return NextResponse.json(
        { error: 'Título, data e local do evento são obrigatórios' },
        { status: 400 }
      );
    }

    // ── Resolve event fields from calendar event if provided ──
    let resolvedEventTitle = event_title;
    let resolvedEventDate = event_date;
    let resolvedEventLocation = event_location;
    let resolvedDepartureTime = departure_time;
    let resolvedReturnTime = return_time;
    let resolvedResponsibleName = responsible_name;
    let resolvedObservations = observations;

    if (calendar_event_id && calendar_event_source) {
      try {
        if (calendar_event_source === 'calendar') {
          const calEvent = await db.calendarEvent.findUnique({
            where: { id: calendar_event_id },
            select: {
              title: true, date: true, location: true,
              departure_time: true, return_time: true,
              responsible_name: true, observations: true,
            },
          });
          if (calEvent) {
            resolvedEventTitle = event_title || calEvent.title;
            resolvedEventDate = event_date || (calEvent.date ? calEvent.date.toISOString().slice(0, 10) : event_date);
            resolvedEventLocation = event_location || calEvent.location || event_location;
            resolvedDepartureTime = departure_time ?? calEvent.departure_time ?? departure_time;
            resolvedReturnTime = return_time ?? calEvent.return_time ?? return_time;
            resolvedResponsibleName = responsible_name ?? calEvent.responsible_name ?? responsible_name;
            resolvedObservations = observations ?? calEvent.observations ?? observations;
          }
        } else if (calendar_event_source === 'events') {
          const ev = await db.event.findUnique({
            where: { id: calendar_event_id },
            select: { title: true, date: true, location: true },
          });
          if (ev) {
            resolvedEventTitle = event_title || ev.title;
            resolvedEventDate = event_date || (ev.date ? ev.date.toISOString().slice(0, 10) : event_date);
            resolvedEventLocation = event_location || ev.location || event_location;
          }
        }
      } catch (lookupErr) {
        console.error('Calendar event lookup error:', lookupErr);
      }
    }

    // ── Resolve template ──
    let headerText = 'AUTORIZAÇÃO DE SAÍDA';
    let subtitleText = 'Núcleo de Cidadania de Adolescentes';
    let cityText = 'Limoeiro de Anadia - AL';
    let footerText = 'Documento gerado automaticamente pelo sistema NUCA';
    let declarationText = 'Declaro estar ciente das informações acima e autorizo a participação do(a) aluno(a) na atividade descrita.';

    try {
      let template: {
        header_text: string | null;
        body_text: string | null;
        footer_text: string | null;
        declaration: string | null;
      } | null = null;

      if (template_id) {
        template = await db.documentTemplate.findUnique({
          where: { id: template_id },
          select: { header_text: true, body_text: true, footer_text: true, declaration: true },
        });
      } else {
        template = await db.documentTemplate.findFirst({
          where: { name: 'authorization_exit' },
          select: { header_text: true, body_text: true, footer_text: true, declaration: true },
        });
        if (!template) {
          await seedDefaultTemplates();
          template = await db.documentTemplate.findFirst({
            where: { name: 'authorization_exit' },
            select: { header_text: true, body_text: true, footer_text: true, declaration: true },
          });
        }
      }

      if (template) {
        headerText = template.header_text || headerText;
        subtitleText = template.body_text || subtitleText;
        footerText = template.footer_text || footerText;
        declarationText = template.declaration || declarationText;
      }
    } catch (templateErr) {
      console.error('Template lookup error:', templateErr);
    }

    // ── Fetch students ──
    const students = await db.student.findMany({
      where: { id: { in: student_ids }, status: 'active' },
      select: {
        id: true, full_name: true, class: true, grade: true,
        guardian_name: true, guardian_phone: true,
        school: { select: { name: true } },
      },
      orderBy: { full_name: 'asc' },
    });

    if (students.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum aluno ativo encontrado com os IDs informados' },
        { status: 404 }
      );
    }

    // ── Format event date ──
    const eventDateObj = new Date(resolvedEventDate + 'T00:00:00');
    const eventDateDisplay = eventDateObj.toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    // ══════════════════════════════════════════════════════════════════════════
    // BUILD THE PDF — NUCA Institutional Template
    // ══════════════════════════════════════════════════════════════════════════
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();   // 210mm
    const ph = doc.internal.pageSize.getHeight();  // 297mm
    const margin = 18;
    const contentWidth = pw - margin * 2;

    // ── Helper: Draw top-left wave decoration ──
    const drawHeaderWaves = () => {
      // Orange wave (outermost) — from top-left corner sweeping down
      doc.setFillColor(...ORANGE);
      doc.triangle(0, 0, pw * 0.55, 0, 0, 52, 'F');

      // Cyan wave (middle)
      doc.setFillColor(...CYAN);
      doc.triangle(0, 0, pw * 0.45, 0, 0, 38, 'F');

      // Blue wave (innermost / closest to content)
      doc.setFillColor(...BLUE);
      doc.triangle(0, 0, pw * 0.35, 0, 0, 26, 'F');

      // Draw curved wave edges using small filled rectangles/triangles
      // Orange wave bottom edge — soft curve
      doc.setFillColor(...ORANGE);
      const steps = 20;
      for (let i = 0; i < steps; i++) {
        const x1 = (i / steps) * pw * 0.6;
        const x2 = ((i + 1) / steps) * pw * 0.6;
        const baseY = 52;
        const curve1 = baseY - Math.sin((i / steps) * Math.PI) * 8;
        const curve2 = baseY - Math.sin(((i + 1) / steps) * Math.PI) * 8;
        doc.triangle(x1, curve1, x2, curve2, x2, 52, 'F');
        doc.triangle(x1, curve1, x2, 52, x1, 52, 'F');
      }

      // Title text over the blue wave area
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...WHITE);
      doc.text(headerText, margin, 16);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(200, 225, 255);
      doc.text('Para Passeio / Atividade Escolar', margin, 22);
    };

    // ── Helper: Draw bottom-right wave decoration ──
    const drawFooterWaves = (pageNum: number, totalPages: number) => {
      // Orange wave (outermost) — from bottom-right corner sweeping up
      doc.setFillColor(...ORANGE);
      doc.triangle(pw, ph, pw * 0.45, ph, pw, ph - 52, 'F');

      // Cyan wave (middle)
      doc.setFillColor(...CYAN);
      doc.triangle(pw, ph, pw * 0.55, ph, pw, ph - 38, 'F');

      // Blue wave (innermost)
      doc.setFillColor(...BLUE);
      doc.triangle(pw, ph, pw * 0.65, ph, pw, ph - 26, 'F');

      // Curved wave edges for orange
      doc.setFillColor(...ORANGE);
      const steps = 20;
      for (let i = 0; i < steps; i++) {
        const x1 = pw - ((i / steps) * pw * 0.6);
        const x2 = pw - (((i + 1) / steps) * pw * 0.6);
        const baseY = ph - 52;
        const curve1 = baseY + Math.sin((i / steps) * Math.PI) * 8;
        const curve2 = baseY + Math.sin(((i + 1) / steps) * Math.PI) * 8;
        doc.triangle(x1, curve1, x2, curve2, x2, baseY, 'F');
        doc.triangle(x1, curve1, x2, baseY, x1, baseY, 'F');
      }

      // Footer text
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...WHITE);
      doc.text(footerText, margin, ph - 10);
      doc.text(
        `Página ${pageNum} de ${totalPages}`,
        pw - margin,
        ph - 10,
        { align: 'right' }
      );
    };

    // ── Helper: Draw NUCA logo at top-right ──
    const drawNucalogo = () => {
      const logoX = pw - margin;
      const logoY = 9;

      // "NUCA" in colorful letters — using individual text() calls properly
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');

      // Measure total width to right-align
      const charW = doc.getTextWidth('N');
      const totalW = charW * 4 + 1.5 * 3; // 4 chars + 3 gaps

      let cx = logoX - totalW;

      // N - Green
      doc.setTextColor(124, 179, 66);
      doc.text('N', cx, logoY);
      cx += charW + 1.5;

      // U - Yellow/Amber
      doc.setTextColor(255, 193, 7);
      doc.text('U', cx, logoY);
      cx += charW + 1.5;

      // C - Cyan
      doc.setTextColor(41, 171, 226);
      doc.text('C', cx, logoY);
      cx += charW + 1.5;

      // A - Blue
      doc.setTextColor(0, 114, 206);
      doc.text('A', cx, logoY);

      // Subtitle under logo
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...DARK_TEXT);
      doc.text(subtitleText, logoX, logoY + 4.5, { align: 'right' });
      doc.setFontSize(5.5);
      doc.setTextColor(...MID_GRAY);
      doc.text(cityText, logoX, logoY + 8, { align: 'right' });
    };

    // ── Helper: Draw a styled field row ──
    const drawField = (
      label: string,
      value: string,
      x: number,
      y: number,
      fieldWidth: number,
      labelWidth: number = 28
    ): number => {
      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...BLUE_DARK);
      doc.text(label, x, y);

      // Value
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_TEXT);
      doc.setFontSize(8.5);
      let truncated = value;
      const valueMaxWidth = fieldWidth - labelWidth - 2;
      if (doc.getTextWidth(truncated) > valueMaxWidth) {
        while (
          truncated.length > 0 &&
          doc.getTextWidth(truncated + '…') > valueMaxWidth
        ) {
          truncated = truncated.slice(0, -1);
        }
        truncated += '…';
      }
      doc.text(truncated, x + labelWidth, y);

      // Subtle underline
      doc.setDrawColor(...LIGHT_LINE);
      doc.setLineWidth(0.2);
      doc.line(x + labelWidth, y + 1.2, x + fieldWidth, y + 1.2);

      return y;
    };

    // ── Helper: Section title with accent bar ──
    const drawSectionTitle = (title: string, y: number, accentColor: [number, number, number] = BLUE): number => {
      // Accent bar
      doc.setFillColor(...accentColor);
      doc.rect(margin, y, 3, 6, 'F');

      // Title text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...BLUE_DARK);
      doc.text(title, margin + 6, y + 5);

      // Thin line under section
      doc.setDrawColor(...LIGHT_LINE);
      doc.setLineWidth(0.4);
      doc.line(margin, y + 8, pw - margin, y + 8);

      return y + 12;
    };

    // ── Helper: Draw student section ──
    const drawStudentSection = (student: typeof students[0], idx: number, startY: number): number => {
      let y = startY;

      const cardPadding = 7;
      const cardX = margin + 2;
      const cardW = contentWidth - 4;
      const estimatedCardH = 82;

      // Card background
      doc.setFillColor(...ICE_BG);
      doc.roundedRect(cardX, y - 3, cardW, estimatedCardH, 3, 3, 'F');

      // Left accent bar
      doc.setFillColor(...BLUE);
      doc.rect(cardX, y - 3, 2.5, estimatedCardH, 'F');

      // Thin border
      doc.setDrawColor(...LIGHT_LINE);
      doc.setLineWidth(0.3);
      doc.roundedRect(cardX, y - 3, cardW, estimatedCardH, 3, 3, 'S');

      // Student number badge
      doc.setFillColor(...BLUE);
      doc.roundedRect(cardX + 5, y, 24, 7, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...WHITE);
      doc.text(`ALUNO ${idx + 1}`, cardX + 17, y + 5, { align: 'center' });

      y += 11;

      // Student info fields
      const halfW = (cardW - cardPadding * 2) / 2;

      drawField('Nome:', student.full_name, cardX + cardPadding, y, cardW - cardPadding * 2, 13);
      y += 8;

      drawField('Turma:', student.class || '—', cardX + cardPadding, y, halfW - 2, 13);
      drawField('Série:', student.grade || '—', cardX + cardPadding + halfW, y, halfW, 11);
      y += 8;

      drawField('Escola:', student.school.name, cardX + cardPadding, y, cardW - cardPadding * 2, 13);
      y += 8;

      drawField('Responsável:', student.guardian_name || '—', cardX + cardPadding, y, halfW + 18, 22);
      drawField('Tel.:', student.guardian_phone || '—', cardX + cardPadding + halfW + 20, y, halfW - 20, 9);
      y += 11;

      // ── Authorization checkbox + text ──
      doc.setDrawColor(...BLUE_DARK);
      doc.setLineWidth(0.4);
      doc.roundedRect(cardX + cardPadding, y - 3.5, 4, 4, 0.5, 0.5, 'S');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...DARK_TEXT);
      doc.text(
        'Autorizo meu/minha filho(a) a participar da atividade descrita acima.',
        cardX + cardPadding + 7,
        y
      );
      y += 9;

      // ── Signature lines ──
      const sigWidth = 62;
      const sigGap = 18;
      const sigStartX = cardX + cardPadding;

      doc.setDrawColor(...MID_GRAY);
      doc.setLineWidth(0.3);

      // Responsible signature
      doc.line(sigStartX, y + 8, sigStartX + sigWidth, y + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MID_GRAY);
      doc.text('Assinatura do Responsável', sigStartX + sigWidth / 2, y + 12, { align: 'center' });

      // Student signature
      doc.line(sigStartX + sigWidth + sigGap, y + 8, sigStartX + sigWidth * 2 + sigGap, y + 8);
      doc.text('Assinatura do Aluno(a)', sigStartX + sigWidth * 1.5 + sigGap, y + 12, { align: 'center' });

      // ── Declaration ──
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(...MID_GRAY);
      const declLines = doc.splitTextToSize(declarationText, cardW - cardPadding * 2) as string[];
      let declY = y + 15;
      for (const line of declLines) {
        doc.text(line, cardX + cardPadding, declY);
        declY += 3.5;
      }

      return startY + estimatedCardH + 5;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // PAGE 1 — Header + Event Details + Student Sections
    // ══════════════════════════════════════════════════════════════════════════

    // Draw header waves
    drawHeaderWaves();

    // Draw NUCA logo at top-right (over white area)
    drawNucalogo();

    // Separator line under header
    doc.setDrawColor(...LIGHT_LINE);
    doc.setLineWidth(0.5);
    doc.line(margin, 30, pw - margin, 30);

    let y = 36;

    // ── Event Details Card ──
    let eventEstimatedH = 38;
    if (resolvedDepartureTime || resolvedReturnTime) eventEstimatedH += 8;
    if (resolvedResponsibleName) eventEstimatedH += 8;
    if (resolvedObservations) eventEstimatedH += 14;

    // Event card background
    const eventCardX = margin;
    const eventCardW = contentWidth;
    doc.setFillColor(255, 248, 240); // very light orange tint
    doc.roundedRect(eventCardX, y - 4, eventCardW, eventEstimatedH, 3, 3, 'F');

    // Left accent bar (orange for event section)
    doc.setFillColor(...ORANGE);
    doc.rect(eventCardX, y - 4, 2.5, eventEstimatedH, 'F');

    // Thin border
    doc.setDrawColor(...LIGHT_LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(eventCardX, y - 4, eventCardW, eventEstimatedH, 3, 3, 'S');

    // Section title
    y = drawSectionTitle('Dados da Atividade', y, ORANGE);

    // Event fields in a grid
    const halfContentW = (contentWidth - 12) / 2;

    drawField('Título:', resolvedEventTitle, margin + 5, y, contentWidth - 10, 14);
    y += 8;

    drawField('Data:', eventDateDisplay, margin + 5, y, halfContentW, 13);
    drawField('Local:', resolvedEventLocation, margin + 5 + halfContentW + 4, y, halfContentW, 13);
    y += 8;

    if (resolvedDepartureTime || resolvedReturnTime) {
      drawField('Saída:', resolvedDepartureTime || '—', margin + 5, y, halfContentW, 13);
      drawField('Retorno:', resolvedReturnTime || '—', margin + 5 + halfContentW + 4, y, halfContentW, 13);
      y += 8;
    }

    if (resolvedResponsibleName) {
      drawField('Responsável:', resolvedResponsibleName, margin + 5, y, contentWidth - 10, 22);
      y += 8;
    }

    if (resolvedObservations) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...BLUE_DARK);
      doc.text('Observações:', margin + 5, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_TEXT);
      doc.setFontSize(8.5);
      const obsLines = doc.splitTextToSize(resolvedObservations, contentWidth - 40) as string[];
      let obsY = y + 4;
      for (const line of obsLines.slice(0, 3)) {
        doc.text(line, margin + 34, obsY);
        obsY += 5;
      }
      y = obsY + 2;
    }

    // Move past the event card
    y = 36 + eventEstimatedH + 6;

    // ── Student Sections ──
    const MIN_STUDENT_HEIGHT = 90;
    const STUDENTS_PER_PAGE = 2;
    let currentStudentOnPage = 0;

    for (let idx = 0; idx < students.length; idx++) {
      const student = students[idx];

      // Check if we need a new page
      if (y + MIN_STUDENT_HEIGHT > ph - 45) {
        doc.addPage();
        drawHeaderWaves();
        drawNucalogo();
        doc.setDrawColor(...LIGHT_LINE);
        doc.setLineWidth(0.5);
        doc.line(margin, 30, pw - margin, 30);
        y = 36;
        currentStudentOnPage = 0;
      } else if (currentStudentOnPage >= STUDENTS_PER_PAGE) {
        doc.addPage();
        drawHeaderWaves();
        drawNucalogo();
        doc.setDrawColor(...LIGHT_LINE);
        doc.setLineWidth(0.5);
        doc.line(margin, 30, pw - margin, 30);
        y = 36;
        currentStudentOnPage = 0;
      }

      y = drawStudentSection(student, idx, y);
      currentStudentOnPage++;
    }

    // ── Add footer waves to all pages ──
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooterWaves(i, totalPages);
    }

    // ── Audit log ──
    await logAction(
      req.user!.userId,
      'export_report',
      `Geração de autorização de passeio (PDF): evento="${resolvedEventTitle}", alunos=${students.length}`,
      req
    );

    // ── Return PDF ──
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const eventSlug = resolvedEventTitle
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'passeio';

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="autorizacao-passeio_${eventSlug}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Authorization PDF error:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar autorização de passeio' },
      { status: 500 }
    );
  }
});
