import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const GET = withRole(['Admin', 'Operator'], async (
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'pdf';

    // Fetch student with school info
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
        { error: 'Aluno não encontrado' },
        { status: 404 }
      );
    }

    // Fetch all event participations for this student
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
      upcoming: 'Próximo',
      ongoing: 'Em Andamento',
      completed: 'Concluído',
      cancelled: 'Cancelado',
    };

    await logAction(
      req.user!.userId,
      'export_report',
      `Exportação PDF do relatório individual: ${student.full_name}`,
      req
    );

    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'landscape' });

      // Title
      doc.setFontSize(18);
      doc.text('Relatório Individual do Aluno', 14, 20);

      // Student Info
      doc.setFontSize(12);
      doc.text(`Aluno: ${student.full_name}`, 14, 32);

      doc.setFontSize(9);
      let y = 40;
      const info = [
        student.cpf ? `CPF: ${student.cpf}` : null,
        student.rg ? `RG: ${student.rg}` : null,
        student.date_of_birth ? `Data de Nascimento: ${new Date(student.date_of_birth).toLocaleDateString('pt-BR')}` : null,
        student.grade ? `Série: ${student.grade}` : null,
        student.class ? `Turma: ${student.class}` : null,
        `Escola: ${student.school.name}`,
        student.school.address ? `Endereço da Escola: ${student.school.address}` : null,
        student.phone ? `Telefone: ${student.phone}` : null,
        student.guardian_name ? `Responsável: ${student.guardian_name}` : null,
        student.guardian_phone ? `Tel. Responsável: ${student.guardian_phone}` : null,
        student.blood_type ? `Tipo Sanguíneo: ${student.blood_type}` : null,
        student.special_needs ? `Necessidades Especiais: ${student.special_needs}` : null,
      ].filter(Boolean) as string[];

      for (const line of info) {
        doc.text(line, 14, y);
        y += 5;
      }

      y += 3;

      // Attendance summary
      doc.setFontSize(11);
      doc.text(`Resumo de Frequência: ${attendedCount} de ${totalEvents} eventos (${attendanceRate}%)`, 14, y);
      y += 8;

      // Events table
      autoTable(doc, {
        startY: y,
        head: [['Evento', 'Data', 'Local', 'Status', 'Presença', 'Observações']],
        body: participations.map((p) => [
          p.event.title,
          new Date(p.event.date).toLocaleDateString('pt-BR'),
          p.event.location || '-',
          eventStatusLabels[p.event.status] || p.event.status,
          p.attended ? 'Presente' : 'Ausente',
          p.notes || '-',
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [34, 139, 34] },
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
          `Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Página ${i} de ${pageCount}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 8,
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
      { error: 'Formato não suportado' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Student report export error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
