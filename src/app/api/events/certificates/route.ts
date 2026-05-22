import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import jsPDF from 'jspdf';
import { v4 as uuidv4 } from 'uuid';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const event_id = searchParams.get('event_id');
    const student_id = searchParams.get('student_id');

    if (!event_id) {
      return NextResponse.json(
        { error: 'ID do evento é obrigatório' },
        { status: 400 }
      );
    }

    if (!student_id) {
      return NextResponse.json(
        { error: 'ID do aluno é obrigatório' },
        { status: 400 }
      );
    }

    // Fetch event data
    const event = await db.event.findUnique({
      where: { id: event_id },
      include: {
        school: { select: { id: true, name: true } },
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: 'Evento não encontrado' },
        { status: 404 }
      );
    }

    // Fetch student data
    const student = await db.student.findUnique({
      where: { id: student_id },
      include: {
        school: { select: { id: true, name: true } },
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'Aluno não encontrado' },
        { status: 404 }
      );
    }

    // Verify participation
    const participation = await db.eventParticipant.findUnique({
      where: {
        event_id_student_id: { event_id, student_id },
      },
    });

    if (!participation) {
      return NextResponse.json(
        { error: 'Aluno não participou deste evento' },
        { status: 400 }
      );
    }

    // Generate unique validation code
    const validationCode = `NUCA-${uuidv4().substring(0, 8).toUpperCase()}`;

    // Generate PDF
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;

    // ── Professional border/frame ──
    // Outer border
    doc.setDrawColor(22, 163, 74); // emerald-600
    doc.setLineWidth(2);
    doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

    // Inner border
    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(0.5);
    doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

    // Corner decorations
    const cornerSize = 15;
    const corners = [
      { x: 8, y: 8 }, // top-left
      { x: pageWidth - 8 - cornerSize, y: 8 }, // top-right
      { x: 8, y: pageHeight - 8 - cornerSize }, // bottom-left
      { x: pageWidth - 8 - cornerSize, y: pageHeight - 8 - cornerSize }, // bottom-right
    ];

    doc.setFillColor(22, 163, 74);
    for (const corner of corners) {
      doc.rect(corner.x, corner.y, cornerSize, 2, 'F');
      doc.rect(corner.x, corner.y, 2, cornerSize, 'F');
    }

    // ── Top decorative line ──
    const topY = 30;
    doc.setFillColor(22, 163, 74);
    doc.rect(margin, topY, pageWidth - margin * 2, 0.8, 'F');

    // ── Title ──
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text('Certificado de Participacao', pageWidth / 2, 50, { align: 'center' });

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
    doc.text(student.full_name, pageWidth / 2, 92, { align: 'center' });

    // ── Participation text ──
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('participou do evento', pageWidth / 2, 104, { align: 'center' });

    // ── Event name ──
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text(event.title, pageWidth / 2, 116, { align: 'center' });

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

    // School name
    const schoolName = event.school?.name || student.school?.name || null;
    if (schoolName) {
      doc.text(`Escola: ${schoolName}`, pageWidth / 2, detailY, { align: 'center' });
      detailY += 7;
    }

    // ── Bottom decorative line ──
    doc.setFillColor(22, 163, 74);
    doc.rect(margin, detailY + 5, pageWidth - margin * 2, 0.5, 'F');

    // ── Validation code (QR code placeholder) ──
    const codeY = detailY + 15;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Codigo de validacao:', pageWidth / 2 - 30, codeY);

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

    // ── Bottom corner decoration ──
    doc.setFillColor(22, 163, 74);
    doc.rect(margin, pageHeight - 25, pageWidth - margin * 2, 0.5, 'F');
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text('NUCA Plataforma - Sistema de Gestao Escolar', pageWidth / 2, pageHeight - 20, { align: 'center' });

    // Return PDF buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=certificado-${student.full_name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      },
    });
  } catch (error) {
    console.error('Certificate generation error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
