import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { seedDefaultTemplates } from '@/lib/seed-templates';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// ── NUCA brand colors ────────────────────────────────────────────────────────
const TEAL: [number, number, number] = [13, 148, 136];       // #0d9488
const TEAL_DARK: [number, number, number] = [10, 110, 100];
const DARK_TEXT: [number, number, number] = [40, 40, 40];
const LIGHT_GRAY: [number, number, number] = [248, 248, 248];
const MID_GRAY: [number, number, number] = [140, 140, 140];
const WHITE: [number, number, number] = [255, 255, 255];

/**
 * POST /api/students/authorization-pdf
 *
 * Generates a trip authorization PDF ("Autorização de Saída para Passeio")
 * for one or more students. Requires Admin or Operator role.
 *
 * Body:
 *   student_ids: string[]           — array of student IDs
 *   event_title: string             — name of the trip/event
 *   event_date: string              — date of the trip (YYYY-MM-DD or ISO)
 *   event_location: string          — destination
 *   departure_time?: string         — departure time
 *   return_time?: string            — expected return time
 *   responsible_name?: string       — teacher/responsible for the trip
 *   observations?: string           — additional notes
 *   template_id?: string            — optional PDF template ID
 *   calendar_event_id?: string      — optional event ID to auto-fill event fields
 *   calendar_event_source?: string  — "calendar" or "events" — which model to look up
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
              title: true,
              date: true,
              location: true,
              departure_time: true,
              return_time: true,
              responsible_name: true,
              observations: true,
            },
          });
          if (calEvent) {
            // Only use calendar event data if the body doesn't already have explicit values
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
            select: {
              title: true,
              date: true,
              location: true,
            },
          });
          if (ev) {
            resolvedEventTitle = event_title || ev.title;
            resolvedEventDate = event_date || (ev.date ? ev.date.toISOString().slice(0, 10) : event_date);
            resolvedEventLocation = event_location || ev.location || event_location;
          }
        }
      } catch (lookupErr) {
        console.error('Calendar event lookup error:', lookupErr);
        // Continue with whatever event data was provided in the body
      }
    }

    // ── Resolve template ──
    let headerText = 'NUCA - Autorização de Saída para Passeio/Atividade';
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
          select: {
            header_text: true,
            body_text: true,
            footer_text: true,
            declaration: true,
          },
        });
      } else {
        // Try to find the default authorization_exit template
        template = await db.documentTemplate.findFirst({
          where: { name: 'authorization_exit' },
          select: {
            header_text: true,
            body_text: true,
            footer_text: true,
            declaration: true,
          },
        });

        // If no default template exists, seed and try again
        if (!template) {
          await seedDefaultTemplates();
          template = await db.documentTemplate.findFirst({
            where: { name: 'authorization_exit' },
            select: {
              header_text: true,
              body_text: true,
              footer_text: true,
              declaration: true,
            },
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
      // Continue with hardcoded defaults
    }

    // ── Fetch students ──
    const students = await db.student.findMany({
      where: {
        id: { in: student_ids },
        status: 'active',
      },
      select: {
        id: true,
        full_name: true,
        class: true,
        grade: true,
        guardian_name: true,
        guardian_phone: true,
        school: {
          select: { name: true },
        },
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
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // ── Build the PDF (A4 portrait) ──
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();   // 210mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    // ── Helper: draw header on every page ──
    const drawHeader = () => {
      // Top teal bar
      doc.setFillColor(...TEAL);
      doc.rect(0, 0, pageWidth, 20, 'F');

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...WHITE);
      doc.text(headerText, margin, 10);

      // Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(subtitleText, margin, 16);

      // System identifier on the right
      doc.setFontSize(7);
      doc.text('Sistema NUCA', pageWidth - margin, 16, { align: 'right' });
    };

    // ── Helper: draw footer ──
    const drawFooter = (pageNum: number, totalPages: number) => {
      const footerY = pageHeight - 10;

      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...MID_GRAY);
      doc.text(footerText, margin, footerY);
      doc.text(
        `Página ${pageNum} de ${totalPages}`,
        pageWidth - margin,
        footerY,
        { align: 'right' }
      );
    };

    // ── Helper: section title ──
    const drawSectionTitle = (title: string, y: number): number => {
      doc.setFillColor(...TEAL);
      doc.rect(margin, y, 2.5, 5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...TEAL_DARK);
      doc.text(title, margin + 5, y + 4);

      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.3);
      doc.line(margin, y + 6, pageWidth - margin, y + 6);

      return y + 10;
    };

    // ── Helper: key-value pair ──
    const drawField = (
      label: string,
      value: string,
      x: number,
      y: number,
      labelWidth: number = 38,
      valueMaxWidth: number = 100
    ): number => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...TEAL_DARK);
      doc.text(label, x, y);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_TEXT);
      let truncated = value;
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
      return y;
    };

    // ── Helper: signature line ──
    const drawSignatureLine = (label: string, x: number, y: number, width: number = 70) => {
      doc.setDrawColor(...DARK_TEXT);
      doc.setLineWidth(0.3);
      doc.line(x, y, x + width, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MID_GRAY);
      doc.text(label, x + width / 2, y + 4, { align: 'center' });
    };

    // ── Helper: checkbox ──
    const drawCheckbox = (label: string, x: number, y: number): number => {
      // Draw checkbox square
      doc.setDrawColor(...DARK_TEXT);
      doc.setLineWidth(0.3);
      doc.rect(x, y - 3, 3.5, 3.5);

      // Label text
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...DARK_TEXT);
      doc.text(label, x + 6, y);

      return y + 6;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // PAGE 1 — Event details header + first student(s)
    // ══════════════════════════════════════════════════════════════════════════
    drawHeader();

    let y = 26;

    // ── Event Details Section (only on page 1) ──
    y = drawSectionTitle('Dados da Atividade', y);

    drawField('Título:', resolvedEventTitle, margin, y, 16, 140);
    y += 7;
    drawField('Data:', eventDateDisplay, margin, y, 16, 140);
    drawField('Local:', resolvedEventLocation, margin + 95, y, 14, 80);
    y += 7;

    if (resolvedDepartureTime) {
      drawField('Saída:', resolvedDepartureTime, margin, y, 14, 40);
    }
    if (resolvedReturnTime) {
      drawField('Retorno:', resolvedReturnTime || '—', margin + 65, y, 16, 40);
    }
    y += 7;

    if (resolvedResponsibleName) {
      drawField('Responsável:', resolvedResponsibleName, margin, y, 26, 140);
      y += 7;
    }

    if (resolvedObservations) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...TEAL_DARK);
      doc.text('Observações:', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DARK_TEXT);
      const obsLines = doc.splitTextToSize(resolvedObservations, contentWidth - 28) as string[];
      let obsY = y + 5;
      for (const line of obsLines.slice(0, 4)) {
        doc.text(line, margin + 28, obsY);
        obsY += 5;
      }
      y = obsY + 3;
    }

    // ── Thin divider before student sections ──
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    // ── For each student: a section ──
    // Approximate: we try to fit 2 students per page when possible
    // If content is too tall, we move to next page
    const studentStartY = y;
    let currentStudentOnPage = 0;
    const STUDENTS_PER_PAGE = 2; // attempt 2 per page
    const MIN_STUDENT_HEIGHT = 80; // minimum space needed for one student section

    for (let idx = 0; idx < students.length; idx++) {
      const student = students[idx];

      // Check if we need a new page
      if (y + MIN_STUDENT_HEIGHT > pageHeight - 20) {
        doc.addPage();
        drawHeader();
        y = 26;
        currentStudentOnPage = 0;
      } else if (currentStudentOnPage >= STUDENTS_PER_PAGE) {
        // Force new page for next pair of students
        doc.addPage();
        drawHeader();
        y = 26;
        currentStudentOnPage = 0;
      }

      // ── Student box ──
      // Light teal background box for the student section
      const boxStartY = y - 2;
      const estimatedBoxHeight = 75;
      doc.setFillColor(240, 252, 251); // very light teal
      doc.roundedRect(margin, boxStartY, contentWidth, estimatedBoxHeight, 2, 2, 'F');

      // Teal left bar for student section
      doc.setFillColor(...TEAL);
      doc.rect(margin, boxStartY, 3, estimatedBoxHeight, 'F');

      // Student number
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...TEAL_DARK);
      doc.text(`Aluno ${idx + 1}`, margin + 7, y + 3);

      y += 8;

      // Student info
      drawField('Nome:', student.full_name, margin + 7, y, 14, 140);
      y += 6;
      drawField('Turma:', student.class || '—', margin + 7, y, 14, 40);
      drawField('Série:', student.grade || '—', margin + 75, y, 12, 40);
      drawField('Escola:', student.school.name, margin + 135, y, 14, 40);
      y += 6;
      drawField('Responsável:', student.guardian_name || '—', margin + 7, y, 26, 90);
      drawField('Tel. Responsável:', student.guardian_phone || '—', margin + 135, y, 32, 40);
      y += 10;

      // Authorization checkbox
      y = drawCheckbox(
        'Autorizo meu/minha filho(a) a participar da atividade descrita acima.',
        margin + 7,
        y
      );
      y += 3;

      // Signature lines
      const sigWidth = 65;
      const sigGap = 20;
      drawSignatureLine('Assinatura do Responsável', margin + 7, y + 8, sigWidth);
      drawSignatureLine('Assinatura do Aluno(a)', margin + 7 + sigWidth + sigGap, y + 8, sigWidth);
      y += 16;

      // Declaration text
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(...MID_GRAY);
      const declLines = doc.splitTextToSize(declarationText, contentWidth - 14) as string[];
      for (const line of declLines) {
        doc.text(line, margin + 7, y);
        y += 4;
      }

      y += 6;
      currentStudentOnPage++;
    }

    // ── Add footers to all pages ──
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(i, totalPages);
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
