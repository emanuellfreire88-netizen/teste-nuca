import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jsPDF from 'jspdf';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/certificates/download?event_id=...&student_id=...
 *
 * PUBLIC endpoint (no authentication required). Generates and returns a
 * certificate PDF for a student who participated in a completed event.
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
        school: { select: { name: true } },
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: 'Evento não encontrado' },
        { status: 404 }
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

    // ── Generate certificate PDF (landscape A4) ──
    const validationCode = `NUCA-${uuidv4().substring(0, 8).toUpperCase()}`;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;

    // ── Decorative borders ──
    doc.setDrawColor(22, 163, 74); // emerald-600
    doc.setLineWidth(2);
    doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(0.5);
    doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

    // Corner decorations
    const cornerSize = 15;
    const corners = [
      { x: 8, y: 8 },
      { x: pageWidth - 8 - cornerSize, y: 8 },
      { x: 8, y: pageHeight - 8 - cornerSize },
      { x: pageWidth - 8 - cornerSize, y: pageHeight - 8 - cornerSize },
    ];
    doc.setFillColor(22, 163, 74);
    for (const corner of corners) {
      doc.rect(corner.x, corner.y, cornerSize, 2, 'F');
      doc.rect(corner.x, corner.y, 2, cornerSize, 'F');
    }

    // ── Top decorative line ──
    doc.setFillColor(22, 163, 74);
    doc.rect(margin, 30, pageWidth - margin * 2, 0.8, 'F');

    // ── Title ──
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text('Certificado de Participação', pageWidth / 2, 50, { align: 'center' });

    // ── Subtitle ──
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('NUCA Plataforma', pageWidth / 2, 58, { align: 'center' });

    // ── Decorative line below title ──
    doc.setFillColor(22, 163, 74);
    doc.rect(pageWidth / 2 - 40, 62, 80, 0.5, 'F');

    // ── Certificate text ──
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('Certificamos que', pageWidth / 2, 78, { align: 'center' });

    // ── Student name (large, bold) ──
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    // Truncate very long names to fit the page
    const maxNameWidth = pageWidth - margin * 2 - 20;
    let displayName = student.full_name;
    if (doc.getTextWidth(displayName) > maxNameWidth) {
      while (doc.getTextWidth(displayName + '…') > maxNameWidth && displayName.length > 0) {
        displayName = displayName.slice(0, -1);
      }
      displayName += '…';
    }
    doc.text(displayName, pageWidth / 2, 92, { align: 'center' });

    // ── Participation text ──
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('participou do evento', pageWidth / 2, 104, { align: 'center' });

    // ── Event name ──
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    let eventTitle = event.title;
    if (doc.getTextWidth(eventTitle) > maxNameWidth) {
      while (doc.getTextWidth(eventTitle + '…') > maxNameWidth && eventTitle.length > 0) {
        eventTitle = eventTitle.slice(0, -1);
      }
      eventTitle += '…';
    }
    doc.text(eventTitle, pageWidth / 2, 116, { align: 'center' });

    // ── Event details ──
    const eventDate = new Date(event.date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);

    let detailY = 130;
    doc.text(`Data: ${eventDate}`, pageWidth / 2, detailY, { align: 'center' });
    detailY += 7;

    if (event.location) {
      doc.text(`Local: ${event.location}`, pageWidth / 2, detailY, { align: 'center' });
      detailY += 7;
    }

    if (event.school?.name) {
      doc.text(`Escola: ${event.school.name}`, pageWidth / 2, detailY, { align: 'center' });
      detailY += 7;
    }

    // ── Bottom decorative line ──
    doc.setFillColor(22, 163, 74);
    doc.rect(margin, detailY + 5, pageWidth - margin * 2, 0.5, 'F');

    // ── Validation code ──
    const codeY = detailY + 15;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Código de validação:', pageWidth / 2 - 30, codeY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.setFontSize(11);
    doc.text(validationCode, pageWidth / 2 + 20, codeY);

    // ── Generated date ──
    const generatedAt = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(`Gerado em: ${generatedAt}`, pageWidth / 2, codeY + 10, { align: 'center' });

    // ── Footer ──
    doc.setFillColor(22, 163, 74);
    doc.rect(margin, pageHeight - 25, pageWidth - margin * 2, 0.5, 'F');
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text('NUCA Plataforma · Sistema de Gestão Escolar', pageWidth / 2, pageHeight - 20, { align: 'center' });

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
