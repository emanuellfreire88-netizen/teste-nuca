import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { seedDefaultTemplates } from '@/lib/seed-templates';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// ── NUCA brand colors (as rgb() 0-1 values for pdf-lib) ────────────────────
const BLUE_DARK_RGB = rgb(0 / 255, 85 / 255, 150 / 255);    // #005596
const DARK_TEXT_RGB = rgb(33 / 255, 37 / 255, 41 / 255);     // #212529
const BLUE_TEXT_RGB = rgb(0 / 255, 85 / 255, 150 / 255);     // #005596
const LIGHT_GRAY_RGB = rgb(108 / 255, 117 / 255, 125 / 255); // #6C757D
const ORANGE_RGB = rgb(247 / 255, 148 / 255, 29 / 255);      // #F7941D
const BORDER_RGB = rgb(160 / 255, 170 / 255, 180 / 255);     // #A0AAB4
const SECTION_BG_RGB = rgb(232 / 255, 244 / 255, 252 / 255); // #E8F4FC
const WHITE_RGB = rgb(1, 1, 1);

/**
 * POST /api/students/authorization-pdf
 *
 * Generates a trip authorization PDF ("Autorização de Saída para Passeio")
 * for one or more students. Uses the NUCA institutional template PDF
 * as background and overlays the authorization content.
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
    let subtitleText = 'Para Passeio / Atividade Escolar';
    let footerText = 'Documento gerado automaticamente pelo sistema NUCA';
    let declarationText = 'Autorizo meu/minha filho(a) a participar da atividade descrita acima.';

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
    // BUILD THE PDF — Using NUCA template as base
    // ══════════════════════════════════════════════════════════════════════════

    // Load the template PDF
    const templatePath = join(process.cwd(), 'public', 'templates', 'authorization-template.pdf');
    const templateBytes = readFileSync(templatePath);
    const templateDoc = await PDFDocument.load(templateBytes);

    // Create the output PDF
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // ── Helper: Sanitize text for pdf-lib (remove non-latin1 chars) ──
    const sanitize = (text: string): string => {
      return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove diacritics for latin1 compat
        .replace(/[^\x00-\xFF]/g, '?');   // replace remaining non-latin1
    };

    // ── Helper: Draw text with accent preservation ──
    const drawText = (
      page: any,
      text: string,
      x: number,
      y: number,
      options: {
        font?: any;
        size?: number;
        color?: any;
        maxWidth?: number;
        align?: 'left' | 'center' | 'right';
      } = {}
    ) => {
      const f = options.font || fontRegular;
      const s = options.size || 10;
      const c = options.color || DARK_TEXT_RGB;

      let drawX = x;
      const sanitized = sanitize(text);

      if (options.align === 'center' && options.maxWidth) {
        const textWidth = f.widthOfTextAtSize(sanitized, s);
        drawX = x + (options.maxWidth - textWidth) / 2;
      } else if (options.align === 'right' && options.maxWidth) {
        const textWidth = f.widthOfTextAtSize(sanitized, s);
        drawX = x + options.maxWidth - textWidth;
      }

      page.drawText(sanitized, {
        x: drawX,
        y,
        size: s,
        font: f,
        color: c,
      });
    };

    // ── Helper: Draw a field with label and value ──
    const drawField = (
      page: any,
      label: string,
      value: string,
      x: number,
      y: number,
      fieldWidth: number,
      labelWidth: number = 90
    ) => {
      // Label
      drawText(page, label, x, y, {
        font: fontBold,
        size: 9,
        color: BLUE_TEXT_RGB,
      });

      // Value
      const valueX = x + labelWidth + 4;
      const valueMaxW = fieldWidth - labelWidth - 8;
      let val = sanitize(value);

      // Truncate if needed
      while (val.length > 0 && fontRegular.widthOfTextAtSize(val, 9) > valueMaxW) {
        val = val.slice(0, -1);
      }
      if (val !== sanitize(value)) val += '...';

      drawText(page, val, valueX, y, {
        font: fontRegular,
        size: 9,
        color: DARK_TEXT_RGB,
      });

      // Underline
      page.drawLine({
        start: { x: valueX, y: y - 3 },
        end: { x: x + fieldWidth, y: y - 3 },
        thickness: 0.5,
        color: BORDER_RGB,
      });
    };

    // ── Helper: Draw a section title with accent bar ──
    const drawSection = (
      page: any,
      title: string,
      x: number,
      y: number,
      width: number,
      accentColor: any = ORANGE_RGB
    ) => {
      // Accent bar
      page.drawRectangle({
        x,
        y: y - 4,
        width: 4,
        height: 12,
        color: accentColor,
      });

      // Title
      drawText(page, title, x + 10, y, {
        font: fontBold,
        size: 11,
        color: BLUE_DARK_RGB,
      });

      // Separator line
      page.drawLine({
        start: { x, y: y - 7 },
        end: { x: x + width, y: y - 7 },
        thickness: 0.5,
        color: BORDER_RGB,
      });

      return y - 16;
    };

    // ── Helper: Draw student card ──
    const drawStudentCard = (
      page: any,
      student: typeof students[0],
      idx: number,
      x: number,
      startY: number,
      width: number
    ): number => {
      let y = startY;

      const cardPad = 18;
      const cardH = 200;
      const cardX = x;
      const innerW = width - cardPad * 2;

      // Card background
      page.drawRectangle({
        x: cardX,
        y: y - cardH,
        width,
        height: cardH,
        color: SECTION_BG_RGB,
        borderColor: BORDER_RGB,
        borderWidth: 0.5,
      });

      // Left accent bar
      page.drawRectangle({
        x: cardX,
        y: y - cardH,
        width: 5,
        height: cardH,
        color: BLUE_DARK_RGB,
      });

      // Student badge
      const badgeW = 75;
      const badgeH = 16;
      page.drawRectangle({
        x: cardX + cardPad,
        y: y - 22,
        width: badgeW,
        height: badgeH,
        color: BLUE_DARK_RGB,
        borderRadius: 3,
      });
      drawText(page, `ALUNO ${idx + 1}`, cardX + cardPad + 10, y - 14, {
        font: fontBold,
        size: 8,
        color: WHITE_RGB,
      });

      y -= 35;

      const halfW = innerW / 2;

      // Nome
      drawField(page, 'Nome:', student.full_name, cardX + cardPad, y, innerW, 42);
      y -= 22;

      // Turma / Serie
      drawField(page, 'Turma:', student.class || '-', cardX + cardPad, y, halfW - 5, 42);
      drawField(page, 'Serie:', student.grade || '-', cardX + cardPad + halfW, y, halfW, 35);
      y -= 22;

      // Escola
      drawField(page, 'Escola:', student.school.name, cardX + cardPad, y, innerW, 42);
      y -= 22;

      // Responsavel / Tel
      drawField(page, 'Responsavel:', student.guardian_name || '-', cardX + cardPad, y, halfW + 50, 70);
      drawField(page, 'Tel.:', student.guardian_phone || '-', cardX + cardPad + halfW + 55, y, halfW - 55, 25);
      y -= 25;

      // Authorization checkbox
      page.drawRectangle({
        x: cardX + cardPad,
        y: y - 10,
        width: 10,
        height: 10,
        borderColor: BLUE_DARK_RGB,
        borderWidth: 1,
      });

      drawText(page, declarationText, cardX + cardPad + 16, y - 2, {
        font: fontRegular,
        size: 8,
        color: DARK_TEXT_RGB,
        maxWidth: innerW - 20,
      });
      y -= 22;

      // Signature lines
      const sigW = 170;
      const sigGap = 40;

      // Responsible signature
      page.drawLine({
        start: { x: cardX + cardPad, y: y - 20 },
        end: { x: cardX + cardPad + sigW, y: y - 20 },
        thickness: 0.5,
        color: LIGHT_GRAY_RGB,
      });
      drawText(page, 'Assinatura do Responsavel', cardX + cardPad, y - 30, {
        font: fontRegular,
        size: 7,
        color: LIGHT_GRAY_RGB,
        maxWidth: sigW,
        align: 'center',
      });

      // Student signature
      page.drawLine({
        start: { x: cardX + cardPad + sigW + sigGap, y: y - 20 },
        end: { x: cardX + cardPad + sigW * 2 + sigGap, y: y - 20 },
        thickness: 0.5,
        color: LIGHT_GRAY_RGB,
      });
      drawText(page, 'Assinatura do Aluno(a)', cardX + cardPad + sigW + sigGap, y - 30, {
        font: fontRegular,
        size: 7,
        color: LIGHT_GRAY_RGB,
        maxWidth: sigW,
        align: 'center',
      });

      return startY - cardH - 12;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // Generate pages
    // ══════════════════════════════════════════════════════════════════════════

    const STUDENTS_PER_PAGE = 2;
    const MARGIN_LEFT = 42;     // ~8% of 595pt
    const MARGIN_RIGHT = 42;
    const CONTENT_WIDTH = 595.5 - MARGIN_LEFT - MARGIN_RIGHT;

    for (let pageIdx = 0; pageIdx < Math.ceil(students.length / STUDENTS_PER_PAGE); pageIdx++) {
      // Copy the template page
      const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
      pdfDoc.addPage(templatePage);
      const page = pdfDoc.getPage(pdfDoc.getPageCount() - 1);

      const { height } = page.getSize();

      // ── Title area (Y: 12-15% from top = ~720pt from bottom) ──
      let y = height - 95;

      drawText(page, headerText, MARGIN_LEFT, y, {
        font: fontBold,
        size: 18,
        color: BLUE_DARK_RGB,
        maxWidth: CONTENT_WIDTH,
        align: 'center',
      });

      y -= 16;

      drawText(page, subtitleText, MARGIN_LEFT, y, {
        font: fontRegular,
        size: 10,
        color: LIGHT_GRAY_RGB,
        maxWidth: CONTENT_WIDTH,
        align: 'center',
      });

      // Separator
      y -= 10;
      page.drawLine({
        start: { x: MARGIN_LEFT, y },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y },
        thickness: 0.8,
        color: BORDER_RGB,
      });

      y -= 18;

      // ── Event Details Section ──
      y = drawSection(page, 'Dados da Atividade', MARGIN_LEFT, y, CONTENT_WIDTH, ORANGE_RGB);

      const halfContentW = CONTENT_WIDTH / 2;

      drawField(page, 'Titulo:', resolvedEventTitle, MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 42);
      y -= 22;

      drawField(page, 'Data:', eventDateDisplay, MARGIN_LEFT + 8, y, halfContentW - 10, 35);
      drawField(page, 'Local:', resolvedEventLocation, MARGIN_LEFT + 8 + halfContentW, y, halfContentW - 10, 38);
      y -= 22;

      if (resolvedDepartureTime || resolvedReturnTime) {
        drawField(page, 'Saida:', resolvedDepartureTime || '-', MARGIN_LEFT + 8, y, halfContentW - 10, 35);
        drawField(page, 'Retorno:', resolvedReturnTime || '-', MARGIN_LEFT + 8 + halfContentW, y, halfContentW - 10, 42);
        y -= 22;
      }

      if (resolvedResponsibleName) {
        drawField(page, 'Responsavel:', resolvedResponsibleName, MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 70);
        y -= 22;
      }

      if (resolvedObservations) {
        drawText(page, 'Observacoes:', MARGIN_LEFT + 8, y, {
          font: fontBold,
          size: 9,
          color: BLUE_TEXT_RGB,
        });
        drawText(page, sanitize(resolvedObservations).slice(0, 80), MARGIN_LEFT + 85, y, {
          font: fontRegular,
          size: 9,
          color: DARK_TEXT_RGB,
        });
        y -= 22;
      }

      y -= 10;

      // ── Student Cards ──
      const pageStudents = students.slice(
        pageIdx * STUDENTS_PER_PAGE,
        (pageIdx + 1) * STUDENTS_PER_PAGE
      );

      for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
        const student = pageStudents[sIdx];
        const globalIdx = pageIdx * STUDENTS_PER_PAGE + sIdx;
        y = drawStudentCard(page, student, globalIdx, MARGIN_LEFT, y, CONTENT_WIDTH);
      }

      // ── Footer text ──
      drawText(page, footerText, MARGIN_LEFT, 40, {
        font: fontItalic,
        size: 6,
        color: LIGHT_GRAY_RGB,
      });

      const pageNum = pageIdx + 1;
      const totalPages = Math.ceil(students.length / STUDENTS_PER_PAGE);
      drawText(page, `Pagina ${pageNum} de ${totalPages}`, MARGIN_LEFT, 30, {
        font: fontRegular,
        size: 6,
        color: LIGHT_GRAY_RGB,
        maxWidth: CONTENT_WIDTH * 0.35,
        align: 'center',
      });
    }

    // ── Audit log ──
    await logAction(
      req.user!.userId,
      'export_report',
      `Geração de autorização de passeio (PDF): evento="${resolvedEventTitle}", alunos=${students.length}`,
      req
    );

    // ── Return PDF ──
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
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
