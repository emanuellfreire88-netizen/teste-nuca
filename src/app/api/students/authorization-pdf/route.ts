import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// ── Brand colors ──────────────────────────────────────────────────────────
const BLUE_DARK  = rgb(0 / 255, 85 / 255, 150 / 255);   // #005596
const DARK_TEXT  = rgb(33 / 255, 37 / 255, 41 / 255);    // #212529
const BLUE_TEXT  = rgb(0 / 255, 85 / 255, 150 / 255);    // #005596
const LIGHT_GRAY = rgb(108 / 255, 117 / 255, 125 / 255); // #6C757D
const ORANGE     = rgb(247 / 255, 148 / 255, 29 / 255);  // #F7941D
const BORDER     = rgb(160 / 255, 170 / 255, 180 / 255); // #A0AAB4
const SECTION_BG = rgb(232 / 255, 244 / 255, 252 / 255); // #E8F4FC
const WHITE      = rgb(1, 1, 1);

/**
 * POST /api/students/authorization-pdf
 *
 * Generates a "TERMO DE AUTORIZAÇÃO" PDF for one or more students,
 * using the NUCA institutional template PDF as background.
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
      activity_description,
      departure_point,
      transport,
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
      activity_description?: string;
      departure_point?: string;
      transport?: string;
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
        { error: 'Titulo, data e local do evento sao obrigatorios' },
        { status: 400 }
      );
    }

    // ── Resolve event fields from calendar event if provided ──
    let resolvedTitle = event_title;
    let resolvedDate = event_date;
    let resolvedLocation = event_location;
    let resolvedDepartureTime = departure_time;
    let resolvedReturnTime = return_time;
    let resolvedResponsibleName = responsible_name;
    let resolvedDescription = activity_description;
    let resolvedDeparturePoint = departure_point;
    let resolvedTransport = transport;
    let resolvedObservations = observations;

    if (calendar_event_id && calendar_event_source) {
      try {
        if (calendar_event_source === 'calendar') {
          const calEvent = await db.calendarEvent.findUnique({
            where: { id: calendar_event_id },
            select: {
              title: true, date: true, location: true,
              departure_time: true, return_time: true,
              responsible_name: true, description: true,
              departure_point: true, transport: true,
              observations: true,
            },
          });
          if (calEvent) {
            resolvedTitle = event_title || calEvent.title;
            resolvedDate = event_date || (calEvent.date ? calEvent.date.toISOString().slice(0, 10) : event_date);
            resolvedLocation = event_location || calEvent.location || event_location;
            resolvedDepartureTime = departure_time ?? calEvent.departure_time ?? departure_time;
            resolvedReturnTime = return_time ?? calEvent.return_time ?? return_time;
            resolvedResponsibleName = responsible_name ?? calEvent.responsible_name ?? responsible_name;
            resolvedDescription = activity_description ?? calEvent.description ?? activity_description;
            resolvedDeparturePoint = departure_point ?? calEvent.departure_point ?? departure_point;
            resolvedTransport = transport ?? calEvent.transport ?? transport;
            resolvedObservations = observations ?? calEvent.observations ?? observations;
          }
        } else if (calendar_event_source === 'events') {
          const ev = await db.event.findUnique({
            where: { id: calendar_event_id },
            select: { title: true, date: true, location: true, description: true },
          });
          if (ev) {
            resolvedTitle = event_title || ev.title;
            resolvedDate = event_date || (ev.date ? ev.date.toISOString().slice(0, 10) : event_date);
            resolvedLocation = event_location || ev.location || event_location;
            resolvedDescription = activity_description ?? ev.description ?? activity_description;
          }
        }
      } catch (lookupErr) {
        console.error('Calendar event lookup error:', lookupErr);
      }
    }

    // ── Fetch students ──
    const students = await db.student.findMany({
      where: { id: { in: student_ids }, status: 'active' },
      select: {
        id: true, full_name: true, class: true, grade: true,
        cpf: true, rg: true,
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
    const eventDateObj = new Date(resolvedDate + 'T00:00:00');
    const eventDateDisplay = eventDateObj.toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    // ══════════════════════════════════════════════════════════════════════════
    // BUILD THE PDF — Using NUCA template as base
    // ══════════════════════════════════════════════════════════════════════════

    const templatePath = join(process.cwd(), 'public', 'templates', 'authorization-template.pdf');
    const templateBytes = readFileSync(templatePath);
    const templateDoc = await PDFDocument.load(templateBytes);

    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // ── Helper: Sanitize text for pdf-lib (remove non-latin1 chars) ──
    const sanitize = (text: string): string => {
      return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x00-\xFF]/g, '?');
    };

    // ── Helper: Draw text ──
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
      const c = options.color || DARK_TEXT;

      let drawX = x;
      const sanitized = sanitize(text);

      if (options.align === 'center' && options.maxWidth) {
        const textWidth = f.widthOfTextAtSize(sanitized, s);
        drawX = x + (options.maxWidth - textWidth) / 2;
      } else if (options.align === 'right' && options.maxWidth) {
        const textWidth = f.widthOfTextAtSize(sanitized, s);
        drawX = x + options.maxWidth - textWidth;
      }

      page.drawText(sanitized, { x: drawX, y, size: s, font: f, color: c });
    };

    // ── Helper: Draw a labeled field with value and underline ──
    const drawField = (
      page: any,
      label: string,
      value: string,
      x: number,
      y: number,
      fieldWidth: number,
      labelWidth: number = 100
    ) => {
      // Label
      drawText(page, label, x, y, {
        font: fontBold,
        size: 9,
        color: BLUE_TEXT,
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
        color: DARK_TEXT,
      });

      // Underline
      page.drawLine({
        start: { x: valueX, y: y - 3 },
        end: { x: x + fieldWidth, y: y - 3 },
        thickness: 0.5,
        color: BORDER,
      });
    };

    // ── Helper: Draw a blank fill-in field with label and underline ──
    const drawBlankField = (
      page: any,
      label: string,
      value: string | null | undefined,
      x: number,
      y: number,
      fieldWidth: number,
      labelWidth: number = 50
    ) => {
      // Label
      drawText(page, label, x, y, {
        font: fontBold,
        size: 9,
        color: BLUE_TEXT,
      });

      const valueX = x + labelWidth + 4;

      // Pre-fill value if available
      if (value) {
        drawText(page, sanitize(value), valueX, y, {
          font: fontRegular,
          size: 9,
          color: DARK_TEXT,
        });
      }

      // Underline across full remaining width
      page.drawLine({
        start: { x: valueX, y: y - 3 },
        end: { x: x + fieldWidth, y: y - 3 },
        thickness: 0.5,
        color: BORDER,
      });
    };

    // ── Helper: Draw a section header ──
    const drawSection = (
      page: any,
      title: string,
      x: number,
      y: number,
      width: number,
      accentColor: any = ORANGE
    ): number => {
      // Accent bar
      page.drawRectangle({
        x,
        y: y - 4,
        width: 4,
        height: 14,
        color: accentColor,
      });

      // Title
      drawText(page, title, x + 10, y, {
        font: fontBold,
        size: 11,
        color: BLUE_DARK,
      });

      // Separator line
      page.drawLine({
        start: { x, y: y - 8 },
        end: { x: x + width, y: y - 8 },
        thickness: 0.5,
        color: BORDER,
      });

      return y - 18;
    };

    // ── Helper: Draw multi-line wrapped text ──
    const drawWrappedText = (
      page: any,
      text: string,
      x: number,
      y: number,
      maxWidth: number,
      options: {
        font?: any;
        size?: number;
        color?: any;
        lineHeight?: number;
      } = {}
    ): number => {
      const f = options.font || fontRegular;
      const s = options.size || 9;
      const c = options.color || DARK_TEXT;
      const lh = options.lineHeight || 14;

      const sanitized = sanitize(text);
      const words = sanitized.split(' ');
      let line = '';
      let currentY = y;

      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const testWidth = f.widthOfTextAtSize(testLine, s);

        if (testWidth > maxWidth && line) {
          page.drawText(line, { x, y: currentY, size: s, font: f, color: c });
          currentY -= lh;
          line = word;
        } else {
          line = testLine;
        }
      }

      if (line) {
        page.drawText(line, { x, y: currentY, size: s, font: f, color: c });
        currentY -= lh;
      }

      return currentY;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // Generate pages — one student per page
    // ══════════════════════════════════════════════════════════════════════════

    const MARGIN_LEFT = 42;
    const MARGIN_RIGHT = 42;
    const CONTENT_WIDTH = 595.5 - MARGIN_LEFT - MARGIN_RIGHT;

    for (const student of students) {
      // Copy the template page
      const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
      pdfDoc.addPage(templatePage);
      const page = pdfDoc.getPage(pdfDoc.getPageCount() - 1);

      const { height } = page.getSize();
      let y = height - 90;

      // ── Title ──
      drawText(page, 'TERMO DE AUTORIZACAO', MARGIN_LEFT, y, {
        font: fontBold,
        size: 18,
        color: BLUE_DARK,
        maxWidth: CONTENT_WIDTH,
        align: 'center',
      });

      y -= 14;

      drawText(page, 'NUCA - Nucleo de Cidadania de Adolescentes', MARGIN_LEFT, y, {
        font: fontRegular,
        size: 9,
        color: LIGHT_GRAY,
        maxWidth: CONTENT_WIDTH,
        align: 'center',
      });

      // Separator
      y -= 10;
      page.drawLine({
        start: { x: MARGIN_LEFT, y },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y },
        thickness: 0.8,
        color: BORDER,
      });
      y -= 18;

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 1: DADOS DO(A) ADOLESCENTE
      // ════════════════════════════════════════════════════════════════════════
      y = drawSection(page, 'DADOS DO(A) ADOLESCENTE', MARGIN_LEFT, y, CONTENT_WIDTH, BLUE_DARK);

      drawField(page, 'Nome:', student.full_name, MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 42);
      y -= 22;

      drawField(page, 'Escola:', student.school.name, MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 42);
      y -= 28;

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 2: DADOS DA ATIVIDADE
      // ════════════════════════════════════════════════════════════════════════
      y = drawSection(page, 'DADOS DA ATIVIDADE', MARGIN_LEFT, y, CONTENT_WIDTH, ORANGE);

      const halfW = (CONTENT_WIDTH - 16) / 2;

      // Nome da atividade
      drawField(page, 'Nome da atividade:', resolvedTitle, MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 105);
      y -= 22;

      // Descricao
      if (resolvedDescription) {
        drawText(page, 'Descricao:', MARGIN_LEFT + 8, y, {
          font: fontBold,
          size: 9,
          color: BLUE_TEXT,
        });
        y -= 14;
        y = drawWrappedText(page, resolvedDescription, MARGIN_LEFT + 12, y, CONTENT_WIDTH - 24, {
          size: 9,
          color: DARK_TEXT,
        });
        y -= 6;
      } else {
        drawField(page, 'Descricao:', '-', MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 65);
        y -= 22;
      }

      // Data + Destino (side by side)
      drawField(page, 'Data:', eventDateDisplay, MARGIN_LEFT + 8, y, halfW - 5, 35);
      drawField(page, 'Destino:', resolvedLocation, MARGIN_LEFT + 8 + halfW, y, halfW, 48);
      y -= 22;

      // Horario saida + retorno (side by side)
      drawField(page, 'Horario de saida:', resolvedDepartureTime || '-', MARGIN_LEFT + 8, y, halfW - 5, 95);
      drawField(page, 'Horario de retorno:', resolvedReturnTime || '-', MARGIN_LEFT + 8 + halfW, y, halfW, 108);
      y -= 22;

      // Ponto de saida + Meio de transporte (side by side)
      drawField(page, 'Ponto de saida:', resolvedDeparturePoint || '-', MARGIN_LEFT + 8, y, halfW - 5, 85);
      drawField(page, 'Meio de transporte:', resolvedTransport || '-', MARGIN_LEFT + 8 + halfW, y, halfW, 108);
      y -= 22;

      // Responsavel pela atividade
      drawField(page, 'Responsavel pela atividade:', resolvedResponsibleName || '-', MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 140);
      y -= 28;

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 3: DADOS DO RESPONSÁVEL LEGAL
      // ════════════════════════════════════════════════════════════════════════
      y = drawSection(page, 'DADOS DO RESPONSAVEL LEGAL', MARGIN_LEFT, y, CONTENT_WIDTH, BLUE_DARK);

      drawBlankField(page, 'Nome:', student.guardian_name, MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 42);
      y -= 22;

      const thirdW = (CONTENT_WIDTH - 24) / 3;

      drawBlankField(page, 'CPF:', student.cpf, MARGIN_LEFT + 8, y, thirdW, 30);
      drawBlankField(page, 'RG:', student.rg, MARGIN_LEFT + 8 + thirdW + 4, y, thirdW, 24);
      drawBlankField(page, 'Telefone:', student.guardian_phone, MARGIN_LEFT + 8 + (thirdW + 4) * 2, y, thirdW, 52);
      y -= 32;

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 4: TERMO DE AUTORIZAÇÃO
      // ════════════════════════════════════════════════════════════════════════
      y = drawSection(page, 'TERMO DE AUTORIZACAO', MARGIN_LEFT, y, CONTENT_WIDTH, ORANGE);

      const termText1 = `Eu, identificado(a) acima como responsavel legal pelo(a) adolescente ${student.full_name}, autorizo sua participacao na atividade descrita neste documento, promovida pelo NUCA - Nucleo de Cidadania de Adolescentes.`;

      const termText2 = 'Declaro estar ciente da programacao, do local, dos horarios de saida e retorno, bem como das orientacoes repassadas pela coordenacao do NUCA.';

      const termText3 = 'Autorizo, ainda, que, em caso de necessidade, sejam adotadas as medidas cabiveis para atendimento medico de urgencia ou emergencia, sendo o responsavel legal comunicado o mais breve possivel.';

      const termText4 = 'Declaro que as informacoes prestadas neste documento sao verdadeiras e assumo inteira responsabilidade por esta autorizacao.';

      const termX = MARGIN_LEFT + 8;
      const termMaxW = CONTENT_WIDTH - 16;

      y = drawWrappedText(page, termText1, termX, y, termMaxW, { size: 9, lineHeight: 14 });
      y -= 6;
      y = drawWrappedText(page, termText2, termX, y, termMaxW, { size: 9, lineHeight: 14 });
      y -= 6;
      y = drawWrappedText(page, termText3, termX, y, termMaxW, { size: 9, lineHeight: 14 });
      y -= 6;
      y = drawWrappedText(page, termText4, termX, y, termMaxW, { size: 9, lineHeight: 14 });
      y -= 20;

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 5: SIGNATURE AREA
      // ════════════════════════════════════════════════════════════════════════

      // Município + Data (side by side)
      drawBlankField(page, 'Municipio:', null, MARGIN_LEFT + 8, y, halfW - 10, 60);
      drawBlankField(page, 'Data:', null, MARGIN_LEFT + 8 + halfW, y, halfW, 35);
      y -= 35;

      // Signature line
      const sigW = 250;
      const sigCenterX = MARGIN_LEFT + CONTENT_WIDTH / 2;

      page.drawLine({
        start: { x: sigCenterX - sigW / 2, y: y - 10 },
        end: { x: sigCenterX + sigW / 2, y: y - 10 },
        thickness: 0.5,
        color: DARK_TEXT,
      });

      drawText(page, 'Assinatura do Responsavel Legal', MARGIN_LEFT, y - 22, {
        font: fontRegular,
        size: 8,
        color: LIGHT_GRAY,
        maxWidth: CONTENT_WIDTH,
        align: 'center',
      });

      // ── Footer ──
      drawText(page, 'Documento gerado automaticamente pelo sistema NUCA - Nucleo de Cidadania de Adolescentes', MARGIN_LEFT, 40, {
        font: fontItalic,
        size: 6,
        color: LIGHT_GRAY,
      });

      // Page number
      const idx = students.indexOf(student);
      drawText(page, `Pagina ${idx + 1} de ${students.length}`, MARGIN_LEFT + CONTENT_WIDTH * 0.6, 30, {
        font: fontRegular,
        size: 6,
        color: LIGHT_GRAY,
        maxWidth: CONTENT_WIDTH * 0.35,
        align: 'center',
      });
    }

    // ── Audit log ──
    await logAction(
      req.user!.userId,
      'export_report',
      `Geracao de Termo de Autorizacao (PDF): evento="${resolvedTitle}", alunos=${students.length}`,
      req
    );

    // ── Return PDF ──
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    const eventSlug = resolvedTitle
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'autorizacao';

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="termo-autorizacao_${eventSlug}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Authorization PDF error:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar termo de autorizacao' },
      { status: 500 }
    );
  }
});
