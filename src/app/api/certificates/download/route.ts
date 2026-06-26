import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jsPDF from 'jspdf';
import { v4 as uuidv4 } from 'uuid';
import { CERTIFICATE_TEMPLATE_PNG_BASE64 } from '@/lib/certificate-template';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/certificates/download?event_id=...&student_id=...
 *
 * PUBLIC endpoint (no authentication required). Generates and returns a
 * certificate PDF for a student who participated in a completed event.
 *
 * The PDF uses the user-provided certificate design (a full-page A4
 * landscape PNG) as its background and overlays the variable text
 * (student name, event, date, location, school, validation code) on top.
 *
 * Security:
 *  - The event must have status "completed" (otherwise no certificate).
 *  - The student must have a participation record with attended=true.
 *  - Only the student's full_name + event info are used in the PDF (no
 *    sensitive data like CPF/email/phone is embedded).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const event_id = searchParams.get('event_id');
    const student_id = searchParams.get('student_id');

    if (!event_id || !student_id) {
      return NextResponse.json(
        { error: 'Parâmetros inválidos' },
        { status: 400 }
      );
    }

    // Fetch event
    const event = await db.event.findUnique({
      where: { id: event_id },
      select: {
        id: true,
        title: true,
        date: true,
        location: true,
        category: true,
        status: true,
        public_certificates: true,
        school: { select: { name: true } },
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: 'Evento não encontrado' },
        { status: 404 }
      );
    }

    // Only events explicitly published by the admin issue public certificates
    if (!event.public_certificates) {
      return NextResponse.json(
        { error: 'Certificado não disponível para este evento' },
        { status: 403 }
      );
    }

    // Only completed events issue certificates
    if (event.status !== 'completed') {
      return NextResponse.json(
        { error: 'Certificado não disponível para este evento' },
        { status: 400 }
      );
    }

    // Fetch student (only public fields)
    const student = await db.student.findUnique({
      where: { id: student_id },
      select: { id: true, full_name: true },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'Aluno não encontrado' },
        { status: 404 }
      );
    }

    // Verify participation + attendance
    const participation = await db.eventParticipant.findUnique({
      where: {
        event_id_student_id: { event_id, student_id },
      },
      select: { attended: true },
    });

    if (!participation || !participation.attended) {
      return NextResponse.json(
        { error: 'Participação não confirmada neste evento' },
        { status: 400 }
      );
    }

    // ── Generate certificate PDF (A4 landscape, matching the template) ──
    const validationCode = `NUCA-${uuidv4().substring(0, 8).toUpperCase()}`;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();   // 297
    const pageHeight = doc.internal.pageSize.getHeight(); // 210
    const centerX = pageWidth / 2;

    // ── 1. Full-page background image (user's certificate design) ──
    // The PNG is 2000×1414 (ratio 1.414) — exactly A4 landscape (297×210).
    try {
      doc.addImage(
        CERTIFICATE_TEMPLATE_PNG_BASE64,
        'PNG',
        0,
        0,
        pageWidth,
        pageHeight,
        undefined,
        'FAST'
      );
    } catch (imgErr) {
      // If the image fails to embed, fall back to a plain background so the
      // certificate still generates. This should never happen in practice.
      console.error('Certificate template image embed failed:', imgErr);
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
    }

    // ── 2. Overlay variable text on top of the template ──
    // The user's template has a LARGE diamond-shaped UNICEF seal occupying the
    // central band (y≈45-158mm, x≈95-185mm), plus wavy decorations on the
    // top-left, the NUCA logo on the top-right, and inferior seals + waves on
    // the bottom. The genuinely empty zones are the two VERTICAL COLUMNS on
    // either side of the central seal:
    //   LEFT  column: x ≈ 10-90mm  (clear for y=45-158mm)
    //   RIGHT column: x ≈ 200-292mm (clear for y=45-158mm)
    // plus a thin top band (y≈30-44mm) and a thin bottom band (y≈158-180mm).
    //
    // Layout strategy (two-column certificate, seal as centerpiece):
    //   LEFT column  → "CERTIFICADO / DE PARTICIPAÇÃO" title + the certificate
    //                  sentence (Certificamos que [NAME] participou do evento
    //                  [EVENT]) — left-aligned, text wraps within the column.
    //   RIGHT column → structured metadata (date / local / escola) + the
    //                  validation code box.
    // The central seal stays fully visible as the visual anchor.

    const leftColX = 15;        // left margin of the left column (mm)
    const leftColW = 75;        // width  of the left column (mm)  → x=15..90
    const rightColX = 205;      // left margin of the right column (mm)
    const rightColW = 85;       // width  of the right column (mm) → x=205..290

    // Helper: truncate a string with ellipsis so it fits a given max width at
    // the currently-set font size/weight.
    const fitText = (s: string, maxW: number): string => {
      if (doc.getTextWidth(s) <= maxW) return s;
      let out = s;
      while (out.length > 0 && doc.getTextWidth(out + '…') > maxW) {
        out = out.slice(0, -1);
      }
      return out + '…';
    };

    // ── LEFT COLUMN: title + certificate sentence ──

    // Title (two lines, bold, institutional blue)
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 60, 110); // dark blue
    doc.setFontSize(16);
    doc.text('CERTIFICADO', leftColX, 58);
    doc.text('DE PARTICIPAÇÃO', leftColX, 66);

    // Thin divider under the title
    doc.setDrawColor(20, 60, 110);
    doc.setLineWidth(0.6);
    doc.line(leftColX, 70, leftColX + leftColW, 70);

    // "Certificamos que"
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    doc.text('Certificamos que', leftColX, 82);

    // Student name (bold, wraps if long)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(20, 20, 20);
    const nameLines = doc.splitTextToSize(student.full_name, leftColW) as string[];
    let yName = 92;
    for (const line of nameLines.slice(0, 3)) {
      doc.text(line, leftColX, yName);
      yName += 7;
    }

    // "participou do evento"
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    doc.text('participou do evento', leftColX, yName + 3);

    // Event name (bold, blue, wraps)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 110, 200);
    const eventLines = doc.splitTextToSize(event.title, leftColW) as string[];
    let yEvent = yName + 13;
    for (const line of eventLines.slice(0, 3)) {
      doc.text(line, leftColX, yEvent);
      yEvent += 7;
    }

    // ── RIGHT COLUMN: structured metadata + validation ──

    // Section label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 60, 110);
    doc.text('INFORMAÇÕES DO EVENTO', rightColX, 58);

    doc.setDrawColor(20, 60, 110);
    doc.setLineWidth(0.6);
    doc.line(rightColX, 62, rightColX + rightColW, 62);

    const eventDate = new Date(event.date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // Data
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('DATA DE REALIZAÇÃO', rightColX, 70);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text(fitText(eventDate, rightColW), rightColX, 77);

    // Local
    let yRight = 88;
    if (event.location) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text('LOCAL', rightColX, yRight);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      const locLines = doc.splitTextToSize(event.location, rightColW) as string[];
      yRight += 6;
      for (const line of locLines.slice(0, 2)) {
        doc.text(line, rightColX, yRight);
        yRight += 5;
      }
      yRight += 3;
    }

    // Escola
    if (event.school?.name) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text('ESCOLA', rightColX, yRight);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      const schoolLines = doc.splitTextToSize(event.school.name, rightColW) as string[];
      yRight += 6;
      for (const line of schoolLines.slice(0, 2)) {
        doc.text(line, rightColX, yRight);
        yRight += 5;
      }
    }

    // Validation code box (bottom of right column)
    const valBoxY = 142;
    doc.setDrawColor(20, 60, 110);
    doc.setLineWidth(0.4);
    doc.setFillColor(245, 248, 252);
    doc.roundedRect(rightColX, valBoxY, rightColW, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('CÓDIGO DE VALIDAÇÃO', rightColX + 3, valBoxY + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20, 60, 110);
    doc.text(validationCode, rightColX + 3, valBoxY + 12);

    // ── Return PDF ──
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const safeName = student.full_name.replace(/\s+/g, '-').toLowerCase().slice(0, 60);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=certificado-${safeName}.pdf`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Certificate download error:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar certificado' },
      { status: 500 }
    );
  }
}
