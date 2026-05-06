import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const GET = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'excel';
    const student_id = searchParams.get('student_id') || '';
    const school_id = searchParams.get('school_id') || '';
    const date_from = searchParams.get('date_from') || '';
    const date_to = searchParams.get('date_to') || '';
    const status = searchParams.get('status') || '';

    const where: Record<string, unknown> = {};

    if (student_id) where.student_id = student_id;
    if (status) where.status = status;

    const dateFilter: Record<string, Date> = {};
    if (date_from) {
      const from = new Date(date_from);
      from.setHours(0, 0, 0, 0);
      dateFilter.gte = from;
    }
    if (date_to) {
      const to = new Date(date_to);
      to.setHours(23, 59, 59, 999);
      dateFilter.lte = to;
    }
    if (Object.keys(dateFilter).length > 0) {
      where.date = dateFilter;
    }

    if (school_id) {
      where.student = { school_id };
    }

    const records = await db.attendanceRecord.findMany({
      where,
      include: {
        student: {
          select: {
            full_name: true,
            class: true,
            grade: true,
            school: { select: { name: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 10000,
    });

    await logAction(req.user!.userId, 'export_report', `Exportação de frequência (${format})`, req);

    if (format === 'pdf') {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Relatório de Frequência', 14, 20);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

      const tableData = records.map((r) => [
        r.student.full_name,
        r.student.school.name,
        r.student.grade || '-',
        r.student.class || '-',
        new Date(r.date).toLocaleDateString('pt-BR'),
        r.status === 'present' ? 'Presente' : 'Ausente',
      ]);

      autoTable(doc, {
        startY: 35,
        head: [['Aluno', 'Escola', 'Série', 'Turma', 'Data', 'Status']],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [34, 139, 34] },
      });

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=frequencia.pdf',
        },
      });
    } else {
      // Excel
      const data = records.map((r) => ({
        Aluno: r.student.full_name,
        Escola: r.student.school.name,
        Série: r.student.grade || '-',
        Turma: r.student.class || '-',
        Data: new Date(r.date).toLocaleDateString('pt-BR'),
        Status: r.status === 'present' ? 'Presente' : 'Ausente',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Frequência');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename=frequencia.xlsx',
        },
      });
    }
  } catch (error) {
    console.error('Export attendance error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
