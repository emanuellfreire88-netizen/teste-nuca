import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { seedDefaultTemplates } from '@/lib/seed-templates';
import jsPDF from 'jspdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// ── NUCA brand colors (matching the institutional template exactly) ────────
const ORANGE: [number, number, number] = [247, 148, 29];       // #F7941D
const CYAN: [number, number, number] = [0, 188, 228];          // #00BCE4
const BLUE_ROYAL: [number, number, number] = [0, 114, 188];    // #0072BC
const BLUE_DARK: [number, number, number] = [0, 85, 150];      // #005596
const DARK_TEXT: [number, number, number] = [33, 37, 41];       // #212529
const BLUE_TEXT: [number, number, number] = [0, 85, 150];      // #005596
const LIGHT_GRAY: [number, number, number] = [108, 117, 125];  // #6C757D
const BORDER_COLOR: [number, number, number] = [206, 212, 218]; // #CED4DA
const SECTION_BG: [number, number, number] = [248, 249, 250];  // #F8F9FA
const WHITE: [number, number, number] = [255, 255, 255];
const GOLD: [number, number, number] = [196, 164, 40];         // #C4A428

/**
 * POST /api/students/authorization-pdf
 *
 * Generates a trip authorization PDF ("Autorização de Saída para Passeio")
 * for one or more students. Layout follows the NUCA institutional template
 * with organic wave decorations (top-left and bottom-right corners),
 * NUCA logo top-right, seal badges bottom-left.
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
    // Layout: Organic bezier waves top-left & bottom-right, white content area,
    // NUCA logo top-right, seal badges bottom-left
    // ══════════════════════════════════════════════════════════════════════════
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();   // 210mm
    const ph = doc.internal.pageSize.getHeight();  // 297mm
    const margin = 16;
    const contentWidth = pw - margin * 2;

    // ── Helper: Draw organic wave header (top-left corner, sweeping diagonally) ──
    // Uses cubic bezier curves via doc.path() for smooth, organic shapes
    const drawHeaderWaves = () => {
      // Layer 1: Blue Dark (back, widest sweep)
      doc.setFillColor(...BLUE_DARK);
      doc.path([
        { op: 'm', c: [0, 0] },
        { op: 'l', c: [pw * 0.70, 0] },
        { op: 'c', c: [pw * 0.62, 8, pw * 0.55, 22, pw * 0.42, 32] },
        { op: 'c', c: [pw * 0.30, 42, pw * 0.15, 38, 0, 28] },
        { op: 'h', c: [] },
      ]);
      doc.fill();

      // Layer 2: Blue Royal (middle)
      doc.setFillColor(...BLUE_ROYAL);
      doc.path([
        { op: 'm', c: [0, 0] },
        { op: 'l', c: [pw * 0.58, 0] },
        { op: 'c', c: [pw * 0.52, 6, pw * 0.46, 17, pw * 0.35, 24] },
        { op: 'c', c: [pw * 0.24, 31, pw * 0.12, 28, 0, 20] },
        { op: 'h', c: [] },
      ]);
      doc.fill();

      // Layer 3: Cyan (middle-front)
      doc.setFillColor(...CYAN);
      doc.path([
        { op: 'm', c: [0, 0] },
        { op: 'l', c: [pw * 0.48, 0] },
        { op: 'c', c: [pw * 0.43, 5, pw * 0.38, 13, pw * 0.28, 18] },
        { op: 'c', c: [pw * 0.18, 23, pw * 0.08, 21, 0, 14] },
        { op: 'h', c: [] },
      ]);
      doc.fill();

      // Layer 4: Orange (front, thinnest, on top)
      doc.setFillColor(...ORANGE);
      doc.path([
        { op: 'm', c: [0, 0] },
        { op: 'l', c: [pw * 0.36, 0] },
        { op: 'c', c: [pw * 0.32, 3, pw * 0.28, 9, pw * 0.20, 12] },
        { op: 'c', c: [pw * 0.12, 15, pw * 0.05, 14, 0, 9] },
        { op: 'h', c: [] },
      ]);
      doc.fill();
    };

    // ── Helper: Draw organic wave footer (bottom-right corner, sweeping up) ──
    const drawFooterWaves = (pageNum: number, totalPages: number) => {
      // Layer 1: Blue Dark (back, widest sweep)
      doc.setFillColor(...BLUE_DARK);
      doc.path([
        { op: 'm', c: [pw, ph] },
        { op: 'l', c: [pw * 0.30, ph] },
        { op: 'c', c: [pw * 0.38, ph - 8, pw * 0.45, ph - 22, pw * 0.58, ph - 32] },
        { op: 'c', c: [pw * 0.70, ph - 42, pw * 0.85, ph - 38, pw, ph - 28] },
        { op: 'h', c: [] },
      ]);
      doc.fill();

      // Layer 2: Blue Royal (middle)
      doc.setFillColor(...BLUE_ROYAL);
      doc.path([
        { op: 'm', c: [pw, ph] },
        { op: 'l', c: [pw * 0.42, ph] },
        { op: 'c', c: [pw * 0.48, ph - 6, pw * 0.54, ph - 17, pw * 0.65, ph - 24] },
        { op: 'c', c: [pw * 0.76, ph - 31, pw * 0.88, ph - 28, pw, ph - 20] },
        { op: 'h', c: [] },
      ]);
      doc.fill();

      // Layer 3: Cyan (middle-front)
      doc.setFillColor(...CYAN);
      doc.path([
        { op: 'm', c: [pw, ph] },
        { op: 'l', c: [pw * 0.52, ph] },
        { op: 'c', c: [pw * 0.57, ph - 5, pw * 0.62, ph - 13, pw * 0.72, ph - 18] },
        { op: 'c', c: [pw * 0.82, ph - 23, pw * 0.92, ph - 21, pw, ph - 14] },
        { op: 'h', c: [] },
      ]);
      doc.fill();

      // Layer 4: Orange (front, thinnest)
      doc.setFillColor(...ORANGE);
      doc.path([
        { op: 'm', c: [pw, ph] },
        { op: 'l', c: [pw * 0.64, ph] },
        { op: 'c', c: [pw * 0.68, ph - 3, pw * 0.72, ph - 9, pw * 0.80, ph - 12] },
        { op: 'c', c: [pw * 0.88, ph - 15, pw * 0.95, ph - 14, pw, ph - 9] },
        { op: 'h', c: [] },
      ]);
      doc.fill();

      // Footer text (on the white area, left side)
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6);
      doc.setTextColor(...LIGHT_GRAY);
      doc.text(footerText, margin, ph - 10);

      // Page number (center-left, on white area)
      doc.text(
        `Página ${pageNum} de ${totalPages}`,
        pw * 0.35,
        ph - 10,
        { align: 'center' }
      );
    };

    // ── Helper: Draw NUCA logo at top-right ──
    const drawNucalogo = () => {
      const logoX = pw - margin;
      const logoY = 14;

      // "NUCA" in colorful letters
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');

      const charW = doc.getTextWidth('N');
      const gap = 1.2;
      const totalW = charW * 4 + gap * 3;
      let cx = logoX - totalW;

      // N - Green
      doc.setTextColor(124, 179, 66); // #7CB342
      doc.text('N', cx, logoY);
      cx += charW + gap;

      // U - Orange
      doc.setTextColor(247, 148, 29); // #F7941D
      doc.text('U', cx, logoY);
      cx += charW + gap;

      // C - Blue Royal
      doc.setTextColor(0, 114, 188); // #0072BC
      doc.text('C', cx, logoY);
      cx += charW + gap;

      // A - Cyan
      doc.setTextColor(0, 188, 228); // #00BCE4
      doc.text('A', cx, logoY);

      // Subtitle: institution name
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(...BLUE_DARK);
      doc.text(subtitleText.toUpperCase(), logoX, logoY + 4, { align: 'right' });

      // City line
      doc.setFontSize(5);
      doc.setTextColor(...LIGHT_GRAY);
      doc.text(cityText, logoX, logoY + 7, { align: 'right' });
    };

    // ── Helper: Draw a styled field with label and value ──
    const drawField = (
      label: string,
      value: string,
      x: number,
      y: number,
      fieldWidth: number,
      labelWidth: number = 26
    ) => {
      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...BLUE_TEXT);
      doc.text(label, x, y);

      // Value
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_TEXT);
      doc.setFontSize(9);
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

      // Underline
      doc.setDrawColor(...BORDER_COLOR);
      doc.setLineWidth(0.3);
      doc.line(x + labelWidth, y + 1.5, x + fieldWidth, y + 1.5);
    };

    // ── Helper: Draw section with colored left bar ──
    const drawSection = (title: string, y: number, color: [number, number, number] = BLUE_ROYAL): number => {
      // Left accent bar
      doc.setFillColor(...color);
      doc.rect(margin, y, 3, 7, 'F');

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...BLUE_DARK);
      doc.text(title, margin + 6, y + 5.5);

      // Separator line
      doc.setDrawColor(...BORDER_COLOR);
      doc.setLineWidth(0.4);
      doc.line(margin, y + 9, pw - margin, y + 9);

      return y + 13;
    };

    // ── Helper: Draw student card ──
    const drawStudentCard = (student: typeof students[0], idx: number, startY: number): number => {
      let y = startY;

      const cardX = margin;
      const cardW = contentWidth;
      const cardPad = 7;
      const cardH = 80;

      // Card background
      doc.setFillColor(...SECTION_BG);
      doc.roundedRect(cardX, y - 2, cardW, cardH, 2, 2, 'F');

      // Left accent bar
      doc.setFillColor(...BLUE_ROYAL);
      doc.rect(cardX, y - 2, 2.5, cardH, 'F');

      // Thin border
      doc.setDrawColor(...BORDER_COLOR);
      doc.setLineWidth(0.2);
      doc.roundedRect(cardX, y - 2, cardW, cardH, 2, 2, 'S');

      // Student badge
      doc.setFillColor(...BLUE_ROYAL);
      doc.roundedRect(cardX + 5, y + 1, 26, 7, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      doc.text(`ALUNO ${idx + 1}`, cardX + 18, y + 5.8, { align: 'center' });

      y += 12;

      const halfW = (cardW - cardPad * 2) / 2;

      // Row 1: Nome
      drawField('Nome:', student.full_name, cardX + cardPad, y, cardW - cardPad * 2, 13);
      y += 9;

      // Row 2: Turma / Série
      drawField('Turma:', student.class || '—', cardX + cardPad, y, halfW - 2, 13);
      drawField('Série:', student.grade || '—', cardX + cardPad + halfW, y, halfW, 11);
      y += 9;

      // Row 3: Escola
      drawField('Escola:', student.school.name, cardX + cardPad, y, cardW - cardPad * 2, 13);
      y += 9;

      // Row 4: Responsável / Tel.
      drawField('Responsável:', student.guardian_name || '—', cardX + cardPad, y, halfW + 16, 22);
      drawField('Tel.:', student.guardian_phone || '—', cardX + cardPad + halfW + 18, y, halfW - 18, 9);
      y += 10;

      // ── Authorization checkbox ──
      doc.setDrawColor(...BLUE_DARK);
      doc.setLineWidth(0.4);
      doc.roundedRect(cardX + cardPad, y - 3.5, 4, 4, 0.5, 0.5, 'S');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...DARK_TEXT);
      doc.text(
        'Autorizo meu/minha filho(a) a participar da atividade descrita acima.',
        cardX + cardPad + 7,
        y
      );
      y += 8;

      // ── Signature lines ──
      const sigW = 58;
      const sigGap = 16;
      const sigX = cardX + cardPad;

      doc.setDrawColor(...LIGHT_GRAY);
      doc.setLineWidth(0.3);

      // Responsible signature
      doc.line(sigX, y + 8, sigX + sigW, y + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...LIGHT_GRAY);
      doc.text('Assinatura do Responsável', sigX + sigW / 2, y + 12, { align: 'center' });

      // Student signature
      doc.line(sigX + sigW + sigGap, y + 8, sigX + sigW * 2 + sigGap, y + 8);
      doc.text('Assinatura do Aluno(a)', sigX + sigW * 1.5 + sigGap, y + 12, { align: 'center' });

      // ── Declaration ──
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(...LIGHT_GRAY);
      const declLines = doc.splitTextToSize(declarationText, cardW - cardPad * 2) as string[];
      let declY = y + 15;
      for (const line of declLines) {
        doc.text(line, cardX + cardPad, declY);
        declY += 3.5;
      }

      return startY + cardH + 5;
    };

    // ── Helper: Draw seal badges at bottom-left ──
    const drawSealBadges = () => {
      const badgeY = ph - 28;
      const badge1X = margin + 11;
      const badge2X = margin + 33;
      const radius = 8.5;

      // UNICEF seal (blue circle)
      doc.setFillColor(...BLUE_ROYAL);
      doc.circle(badge1X, badgeY, radius, 'F');
      // Inner circle border
      doc.setDrawColor(...WHITE);
      doc.setLineWidth(0.4);
      doc.circle(badge1X, badgeY, radius - 1.2, 'S');
      // Text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4);
      doc.setTextColor(...WHITE);
      doc.text('SELO', badge1X, badgeY - 2, { align: 'center' });
      doc.text('UNICEF', badge1X, badgeY + 0.5, { align: 'center' });
      doc.setFontSize(3.5);
      doc.text('2025-2028', badge1X, badgeY + 3, { align: 'center' });

      // Município Aprovado seal (gold circle)
      doc.setFillColor(...GOLD);
      doc.circle(badge2X, badgeY, radius, 'F');
      doc.setDrawColor(...WHITE);
      doc.setLineWidth(0.4);
      doc.circle(badge2X, badgeY, radius - 1.2, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(3.2);
      doc.setTextColor(...WHITE);
      doc.text('MUNICÍPIO', badge2X, badgeY - 2, { align: 'center' });
      doc.text('APROVADO', badge2X, badgeY + 0.5, { align: 'center' });
      doc.setFontSize(3.2);
      doc.text('2015-2016', badge2X, badgeY + 3, { align: 'center' });
    };

    // ══════════════════════════════════════════════════════════════════════════
    // PAGE 1 — Header Waves + Logo + Title + Event + Student Cards
    // ══════════════════════════════════════════════════════════════════════════

    // Draw header waves (top-left organic curves)
    drawHeaderWaves();

    // Draw NUCA logo (top-right)
    drawNucalogo();

    // Document title (centered, below waves)
    let y = 28;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...BLUE_DARK);
    doc.text(headerText, pw / 2, y, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...LIGHT_GRAY);
    doc.text('Para Passeio / Atividade Escolar', pw / 2, y + 5.5, { align: 'center' });

    // Separator line
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 9, pw - margin, y + 9);

    y += 15;

    // ── Event Details Section ──
    y = drawSection('Dados da Atividade', y, ORANGE);

    const halfContentW = (contentWidth - 10) / 2;

    drawField('Título:', resolvedEventTitle, margin + 4, y, contentWidth - 8, 14);
    y += 9;

    drawField('Data:', eventDateDisplay, margin + 4, y, halfContentW, 13);
    drawField('Local:', resolvedEventLocation, margin + 4 + halfContentW + 4, y, halfContentW, 13);
    y += 9;

    if (resolvedDepartureTime || resolvedReturnTime) {
      drawField('Saída:', resolvedDepartureTime || '—', margin + 4, y, halfContentW, 13);
      drawField('Retorno:', resolvedReturnTime || '—', margin + 4 + halfContentW + 4, y, halfContentW, 13);
      y += 9;
    }

    if (resolvedResponsibleName) {
      drawField('Responsável:', resolvedResponsibleName, margin + 4, y, contentWidth - 8, 22);
      y += 9;
    }

    if (resolvedObservations) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...BLUE_TEXT);
      doc.text('Observações:', margin + 4, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_TEXT);
      doc.setFontSize(9);
      const obsLines = doc.splitTextToSize(resolvedObservations, contentWidth - 38) as string[];
      let obsY = y + 4;
      for (const line of obsLines.slice(0, 3)) {
        doc.text(line, margin + 32, obsY);
        obsY += 5;
      }
      y = obsY + 2;
    }

    y += 5;

    // ── Student Cards ──
    const MIN_STUDENT_HEIGHT = 88;
    const STUDENTS_PER_PAGE = 2;
    let currentStudentOnPage = 0;

    for (let idx = 0; idx < students.length; idx++) {
      const student = students[idx];

      // Check if we need a new page
      if (y + MIN_STUDENT_HEIGHT > ph - 45) {
        doc.addPage();
        drawHeaderWaves();
        drawNucalogo();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...BLUE_DARK);
        doc.text(headerText, pw / 2, 28, { align: 'center' });
        doc.setDrawColor(...BORDER_COLOR);
        doc.setLineWidth(0.5);
        doc.line(margin, 33, pw - margin, 33);
        y = 38;
        currentStudentOnPage = 0;
      } else if (currentStudentOnPage >= STUDENTS_PER_PAGE) {
        doc.addPage();
        drawHeaderWaves();
        drawNucalogo();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...BLUE_DARK);
        doc.text(headerText, pw / 2, 28, { align: 'center' });
        doc.setDrawColor(...BORDER_COLOR);
        doc.setLineWidth(0.5);
        doc.line(margin, 33, pw - margin, 33);
        y = 38;
        currentStudentOnPage = 0;
      }

      y = drawStudentCard(student, idx, y);
      currentStudentOnPage++;
    }

    // ── Add footer waves and seal badges to all pages ──
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooterWaves(i, totalPages);
      drawSealBadges();
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
