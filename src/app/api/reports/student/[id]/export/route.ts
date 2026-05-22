import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND_GREEN = [22, 163, 74] as [number, number, number];
const DARK_TEXT = [30, 30, 30] as [number, number, number];
const GRAY_TEXT = [120, 120, 120] as [number, number, number];

export async function GET(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin', 'Operator'], async (_req: AuthenticatedRequest) => {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'pdf';

    const student = await db.student.findUnique({
      where: { id },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            email: true,
            director_name: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'Aluno nao encontrado' },
        { status: 404 }
      );
    }

    const participations = await db.eventParticipant.findMany({
      where: { student_id: id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            location: true,
            status: true,
          },
        },
      },
      orderBy: { event: { date: 'desc' } },
    });

    const totalEvents = participations.length;
    const attendedCount = participations.filter((p) => p.attended).length;
    const attendanceRate = totalEvents > 0 ? Math.round((attendedCount / totalEvents) * 100) : 0;

    const eventStatusLabels: Record<string, string> = {
      upcoming: 'Proximo',
      ongoing: 'Em Andamento',
      completed: 'Concluido',
      cancelled: 'Cancelado',
    };

    await logAction(
      _req.user!.userId,
      'export_report',
      `Exportacao PDF do relatorio individual: ${student.full_name}`,
      _req
    );

    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      let y = 0;

      // ── Header bar ──
      doc.setFillColor(...BRAND_GREEN);
      doc.rect(0, 0, pageWidth, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.text('Relatorio Individual do Aluno', margin, 18);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, margin, 28);

      y = 45;
      doc.setTextColor(...DARK_TEXT);

      // ── Student Info Section ──
      doc.setFontSize(16);
      doc.text(student.full_name, margin, y);
      y += 8;

      // Info grid - 2 columns
      doc.setFontSize(9);
      doc.setTextColor(...DARK_TEXT);
      const leftCol = margin;
      const rightCol = pageWidth / 2 + 10;

      const infoItems: [string, string, string][] = []; // [label, value, column]
      if (student.cpf) infoItems.push(['CPF:', student.cpf, 'left']);
      if (student.rg) infoItems.push(['RG:', student.rg, 'right']);
      if (student.date_of_birth) infoItems.push(['Data de Nascimento:', new Date(student.date_of_birth).toLocaleDateString('pt-BR'), 'left']);
      if (student.grade) infoItems.push(['Serie:', student.grade, 'right']);
      if (student.class) infoItems.push(['Turma:', student.class, 'left']);
      infoItems.push(['Escola:', student.school.name, 'right']);
      if (student.phone) infoItems.push(['Telefone:', student.phone, 'left']);
      if (student.guardian_name) infoItems.push(['Responsavel:', student.guardian_name, 'right']);
      if (student.guardian_phone) infoItems.push(['Tel. Responsavel:', student.guardian_phone, 'left']);
      if (student.blood_type) infoItems.push(['Tipo Sanguineo:', student.blood_type, 'right']);
      if (student.special_needs) infoItems.push(['Necessidades Especiais:', student.special_needs, 'left']);
      if (student.school.director_name) infoItems.push(['Diretor(a):', student.school.director_name, 'right']);

      const leftItems = infoItems.filter(i => i[2] === 'left');
      const rightItems = infoItems.filter(i => i[2] === 'right');
      const maxRows = Math.max(leftItems.length, rightItems.length);

      for (let i = 0; i < maxRows; i++) {
        if (i < leftItems.length) {
          doc.setTextColor(...GRAY_TEXT);
          doc.text(leftItems[i][0], leftCol, y);
          doc.setTextColor(...DARK_TEXT);
          doc.text(leftItems[i][1], leftCol + 38, y);
        }
        if (i < rightItems.length) {
          doc.setTextColor(...GRAY_TEXT);
          doc.text(rightItems[i][0], rightCol, y);
          doc.setTextColor(...DARK_TEXT);
          doc.text(rightItems[i][1], rightCol + 38, y);
        }
        y += 5;
      }

      y += 5;

      // ── Attendance Summary ──
      doc.setFillColor(236, 253, 245);
      doc.rect(margin, y - 3, pageWidth - margin * 2, 12, 'F');
      doc.setTextColor(...BRAND_GREEN);
      doc.setFontSize(11);
      doc.text(`Resumo de Frequencia: ${attendedCount} de ${totalEvents} eventos (${attendanceRate}%)`, margin + 4, y + 5);
      y += 16;

      // ── Events Table ──
      if (participations.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Evento', 'Data', 'Local', 'Status', 'Presenca', 'Observacoes']],
          body: participations.map((p) => [
            p.event.title,
            new Date(p.event.date).toLocaleDateString('pt-BR'),
            p.event.location || '-',
            eventStatusLabels[p.event.status] || p.event.status,
            p.attended ? 'Presente' : 'Ausente',
            p.notes || '-',
          ]),
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [249, 250, 251] as [number, number, number] },
          margin: { left: margin, right: margin },
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_TEXT);
        doc.text(
          `NUCA Plataforma  |  Pagina ${i} de ${pageCount}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename=relatorio-${student.full_name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Formato nao suportado' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Student report export error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
  })(req, context);
}
