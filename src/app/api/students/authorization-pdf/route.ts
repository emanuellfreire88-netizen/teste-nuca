import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { seedDefaultTemplates } from '@/lib/seed-templates';
import jsPDF from 'jspdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// ── NUCA brand colors (Modern wave design) ────────────────────────────────────
const ORANGE: [number, number, number] = [247, 148, 29];       // #F7941D — vibrant orange
const CYAN: [number, number, number] = [41, 171, 226];         // #29ABE2 — light blue
const BLUE: [number, number, number] = [0, 114, 206];          // #0072CE — institutional blue
const BLUE_DARK: [number, number, number] = [0, 94, 184];      // #005EB8 — dark blue
const ICE_BG: [number, number, number] = [230, 240, 250];      // #E6F0FA — ice blue container
const DARK_TEXT: [number, number, number] = [40, 50, 70];       // #283246 — dark navy text
const MID_GRAY: [number, number, number] = [120, 130, 145];    // #788291 — muted text
const LIGHT_LINE: [number, number, number] = [200, 215, 235];  // #C8D7EB — light borders
const WHITE: [number, number, number] = [255, 255, 255];

/**
 * POST /api/students/authorization-pdf
 *
 * Generates a trip authorization PDF ("Autorização de Saída para Passeio")
 * for one or more students. Modern wave design inspired by NUCA institutional template.
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
    // BUILD THE PDF — Modern Wave Design
    // ══════════════════════════════════════════════════════════════════════════
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();   // 210mm
    const ph = doc.internal.pageSize.getHeight();  // 297mm
    const margin = 18;
    const contentWidth = pw - margin * 2;

    // ── Helper: Draw wave header using filled polygons ──
    const drawWaveHeader = () => {
      // Orange wave (back) — smooth curved polygon using sine
      doc.setFillColor(...ORANGE);
      const orangePts: number[][] = [];
      for (let i = 0; i <= 40; i++) {
        const x = (i / 40) * pw;
        const yVal = 5 + Math.sin((i / 40) * Math.PI * 1.2) * 10;
        orangePts.push([x, yVal]);
      }
      orangePts.push([pw, 0], [0, 0]);
      doc.lines(orangePts, 0, 0, [1, 1], 'F');

      // Cyan wave (middle)
      doc.setFillColor(...CYAN);
      const cyanPts: number[][] = [];
      for (let i = 0; i <= 40; i++) {
        const x = (i / 40) * pw;
        const yVal = 8 + Math.sin((i / 40) * Math.PI * 1.4 + 0.5) * 12;
        cyanPts.push([x, yVal]);
      }
      cyanPts.push([pw, 0], [0, 0]);
      doc.lines(cyanPts, 0, 0, [1, 1], 'F');

      // Blue wave (front)
      doc.setFillColor(...BLUE);
      const bluePts: number[][] = [];
      for (let i = 0; i <= 40; i++) {
        const x = (i / 40) * pw;
        const yVal = 15 + Math.sin((i / 40) * Math.PI * 1.6 + 1) * 10;
        bluePts.push([x, yVal]);
      }
      bluePts.push([pw, 0], [0, 0]);
      doc.lines(bluePts, 0, 0, [1, 1], 'F');

      // NUCA Logo text on the right side over the waves
      const logoX = pw - margin - 2;
      const logoY = 8;

      // "NUCA" in colorful letters
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');

      // N - Green
      doc.setTextColor(124, 179, 66); // #7CB342
      doc.text('N', logoX - 38, logoY);
      // U - Yellow/Amber
      doc.setTextColor(255, 193, 7); // #FFC107
      doc.text('U', logoX - 26, logoY);
      // C - Blue
      doc.setTextColor(3, 155, 229); // #039BE5
      doc.text('C', logoX - 15, logoY);
      // A - Light Blue
      doc.setTextColor(41, 171, 226); // #29ABE2
      doc.text('A', logoX - 4, logoY);

      // Subtitle under logo
      doc.setFontSize(5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...WHITE);
      doc.text(subtitleText, logoX, logoY + 4, { align: 'right' });
    };

    // ── Helper: Draw wave footer using filled polygons ──
    const drawWaveFooter = (pageNum: number, totalPages: number) => {
      // Blue wave (back) — curves upward from bottom
      doc.setFillColor(...BLUE);
      const bluePts: number[][] = [];
      for (let i = 0; i <= 40; i++) {
        const x = (i / 40) * pw;
        const yVal = ph - 15 - Math.sin((i / 40) * Math.PI * 1.6 + 1) * 10;
        bluePts.push([x, yVal]);
      }
      bluePts.push([pw, ph], [0, ph]);
      doc.lines(bluePts, 0, 0, [1, 1], 'F');

      // Cyan wave (middle)
      doc.setFillColor(...CYAN);
      const cyanPts: number[][] = [];
      for (let i = 0; i <= 40; i++) {
        const x = (i / 40) * pw;
        const yVal = ph - 8 - Math.sin((i / 40) * Math.PI * 1.4 + 0.5) * 12;
        cyanPts.push([x, yVal]);
      }
      cyanPts.push([pw, ph], [0, ph]);
      doc.lines(cyanPts, 0, 0, [1, 1], 'F');

      // Orange wave (front)
      doc.setFillColor(...ORANGE);
      const orangePts: number[][] = [];
      for (let i = 0; i <= 40; i++) {
        const x = (i / 40) * pw;
        const yVal = ph - 5 - Math.sin((i / 40) * Math.PI * 1.2) * 10;
        orangePts.push([x, yVal]);
      }
      orangePts.push([pw, ph], [0, ph]);
      doc.lines(orangePts, 0, 0, [1, 1], 'F');

      // Footer text on the left
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...WHITE);
      doc.text(footerText, margin, ph - 8);

      // Page number on the right
      doc.text(
        `Página ${pageNum} de ${totalPages}`,
        pw - margin,
        ph - 8,
        { align: 'right' }
      );
    };

    // ── Helper: Draw a styled field row ──
    const drawField = (
      label: string,
      value: string,
      x: number,
      y: number,
      fieldWidth: number,
      labelWidth: number = 32
    ): number => {
      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...BLUE_DARK);
      doc.text(label, x, y);

      // Value
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_TEXT);
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
    const drawSectionTitle = (title: string, y: number): number => {
      // Blue accent bar
      doc.setFillColor(...BLUE);
      doc.roundedRect(margin, y, 3, 6, 1, 1, 'F');

      // Title text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
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

      // Student card dimensions
      const cardPadding = 6;
      const cardX = margin + 2;
      const cardW = contentWidth - 4;
      const estimatedCardH = 78; // estimated height for content

      // 1) Draw card background FIRST (so content appears on top)
      doc.setFillColor(...ICE_BG);
      doc.roundedRect(cardX, y - 3, cardW, estimatedCardH, 4, 4, 'F');

      // Left accent bar
      doc.setFillColor(...BLUE);
      doc.roundedRect(cardX, y - 3, 2.5, estimatedCardH, 1, 1, 'F');

      // Thin border
      doc.setDrawColor(...LIGHT_LINE);
      doc.setLineWidth(0.3);
      doc.roundedRect(cardX, y - 3, cardW, estimatedCardH, 4, 4, 'S');

      // 2) Draw content on top of the background

      // Student number badge
      doc.setFillColor(...BLUE);
      doc.roundedRect(cardX + 4, y, 22, 6, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      doc.text(`ALUNO ${idx + 1}`, cardX + 15, y + 4.2, { align: 'center' });

      y += 10;

      // Student info fields
      const halfW = (cardW - cardPadding * 2) / 2;

      drawField('Nome:', student.full_name, cardX + cardPadding, y, cardW - cardPadding * 2, 14);
      y += 7;

      drawField('Turma:', student.class || '—', cardX + cardPadding, y, halfW - 2, 14);
      drawField('Série:', student.grade || '—', cardX + cardPadding + halfW, y, halfW, 12);
      y += 7;

      drawField('Escola:', student.school.name, cardX + cardPadding, y, cardW - cardPadding * 2, 14);
      y += 7;

      drawField('Responsável:', student.guardian_name || '—', cardX + cardPadding, y, halfW + 15, 24);
      drawField('Tel.:', student.guardian_phone || '—', cardX + cardPadding + halfW + 17, y, halfW - 17, 10);
      y += 10;

      // ── Authorization checkbox ──
      doc.setDrawColor(...BLUE_DARK);
      doc.setLineWidth(0.4);
      doc.roundedRect(cardX + cardPadding, y - 3.5, 4, 4, 0.5, 0.5, 'S');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...DARK_TEXT);
      doc.text(
        'Autorizo meu/minha filho(a) a participar da atividade descrita acima.',
        cardX + cardPadding + 7,
        y
      );
      y += 8;

      // ── Signature lines ──
      const sigWidth = 60;
      const sigGap = 15;

      doc.setDrawColor(...MID_GRAY);
      doc.setLineWidth(0.3);
      doc.line(cardX + cardPadding, y + 8, cardX + cardPadding + sigWidth, y + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...MID_GRAY);
      doc.text('Assinatura do Responsável', cardX + cardPadding + sigWidth / 2, y + 12, { align: 'center' });

      doc.line(cardX + cardPadding + sigWidth + sigGap, y + 8, cardX + cardPadding + sigWidth * 2 + sigGap, y + 8);
      doc.text('Assinatura do Aluno(a)', cardX + cardPadding + sigWidth * 1.5 + sigGap, y + 12, { align: 'center' });

      // ── Declaration ──
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6);
      doc.setTextColor(...MID_GRAY);
      const declLines = doc.splitTextToSize(declarationText, cardW - cardPadding * 2) as string[];
      let declY = y + 15;
      for (const line of declLines) {
        doc.text(line, cardX + cardPadding, declY);
        declY += 3.5;
      }

      return startY + estimatedCardH + 4;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // PAGE 1 — Header + Event Details + Student Sections
    // ══════════════════════════════════════════════════════════════════════════

    // ── Draw header waves ──
    drawWaveHeader();

    // ── Document title in the wave area ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...WHITE);
    doc.text(headerText, margin, 15);

    // Sub-label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(200, 225, 255); // slightly darker for better contrast
    doc.text('Para Passeio / Atividade Escolar', margin, 20);

    let y = 38;

    // ── Event Details Card ──
    // Estimate event card height based on which fields are present
    let eventEstimatedH = 36; // base: title + data/local
    if (resolvedDepartureTime || resolvedReturnTime) eventEstimatedH += 7;
    if (resolvedResponsibleName) eventEstimatedH += 7;
    if (resolvedObservations) eventEstimatedH += 12;

    // Draw event card background FIRST
    const eventCardX = margin;
    const eventCardW = contentWidth;
    doc.setFillColor(255, 248, 240); // very light orange tint
    doc.roundedRect(eventCardX, y - 4, eventCardW, eventEstimatedH, 3, 3, 'F');

    // Left accent bar (orange for event section)
    doc.setFillColor(...ORANGE);
    doc.roundedRect(eventCardX, y - 4, 2.5, eventEstimatedH, 1, 1, 'F');

    // Thin border
    doc.setDrawColor(...LIGHT_LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(eventCardX, y - 4, eventCardW, eventEstimatedH, 3, 3, 'S');

    // Now draw event content on top
    y = drawSectionTitle('Dados da Atividade', y);

    // Event fields in a grid
    const halfContentW = (contentWidth - 12) / 2;

    drawField('Título:', resolvedEventTitle, margin + 4, y, contentWidth - 8, 14);
    y += 7;

    drawField('Data:', eventDateDisplay, margin + 4, y, halfContentW, 14);
    drawField('Local:', resolvedEventLocation, margin + 4 + halfContentW + 4, y, halfContentW, 14);
    y += 7;

    if (resolvedDepartureTime || resolvedReturnTime) {
      drawField('Saída:', resolvedDepartureTime || '—', margin + 4, y, halfContentW, 14);
      drawField('Retorno:', resolvedReturnTime || '—', margin + 4 + halfContentW + 4, y, halfContentW, 14);
      y += 7;
    }

    if (resolvedResponsibleName) {
      drawField('Responsável:', resolvedResponsibleName, margin + 4, y, contentWidth - 8, 24);
      y += 7;
    }

    if (resolvedObservations) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...BLUE_DARK);
      doc.text('Observações:', margin + 4, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_TEXT);
      doc.setFontSize(8);
      const obsLines = doc.splitTextToSize(resolvedObservations, contentWidth - 40) as string[];
      let obsY = y + 4;
      for (const line of obsLines.slice(0, 3)) {
        doc.text(line, margin + 30, obsY);
        obsY += 5;
      }
      y = obsY + 2;
    }

    // Move past the event card
    y = 38 + eventEstimatedH + 4 + 6;

    // ── Student Sections ──
    const MIN_STUDENT_HEIGHT = 85;
    const STUDENTS_PER_PAGE = 2;
    let currentStudentOnPage = 0;

    for (let idx = 0; idx < students.length; idx++) {
      const student = students[idx];

      // Check if we need a new page
      if (y + MIN_STUDENT_HEIGHT > ph - 40) {
        doc.addPage();
        drawWaveHeader();
        // No title on subsequent pages, just small header text
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...WHITE);
        doc.text(headerText, margin, 15);
        y = 38;
        currentStudentOnPage = 0;
      } else if (currentStudentOnPage >= STUDENTS_PER_PAGE) {
        doc.addPage();
        drawWaveHeader();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...WHITE);
        doc.text(headerText, margin, 15);
        y = 38;
        currentStudentOnPage = 0;
      }

      y = drawStudentSection(student, idx, y);
      currentStudentOnPage++;
    }

    // ── Add footer waves to all pages ──
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawWaveFooter(i, totalPages);
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
