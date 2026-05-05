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
    const type = searchParams.get('type') || 'students';

    await logAction(req.user!.userId, 'export_report', `Exportação de relatório (${type}, ${format})`, req);

    if (type === 'students') {
      return await exportStudents(format);
    } else if (type === 'attendance') {
      return await exportAttendanceReport(format);
    } else if (type === 'schools') {
      return await exportSchools(format);
    }

    return NextResponse.json({ error: 'Tipo de relatório inválido' }, { status: 400 });
  } catch (error) {
    console.error('Export report error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

async function exportStudents(format: string) {
  const students = await db.student.findMany({
    include: {
      school: { select: { name: true } },
    },
    orderBy: { full_name: 'asc' },
  });

  const data = students.map((s) => ({
    Nome: s.full_name,
    CPF: s.cpf || '-',
    RG: s.rg || '-',
    'Data Nascimento': s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString('pt-BR') : '-',
    Escola: s.school.name,
    Série: s.grade || '-',
    Turma: s.class || '-',
    Status: s.status === 'active' ? 'Ativo' : 'Inativo',
    Telefone: s.phone || '-',
    Responsável: s.guardian_name || '-',
    'Tel. Responsável': s.guardian_phone || '-',
  }));

  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Relatório de Alunos', 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [['Nome', 'CPF', 'Escola', 'Série', 'Turma', 'Status', 'Responsável']],
      body: students.map((s) => [
        s.full_name,
        s.cpf || '-',
        s.school.name,
        s.grade || '-',
        s.class || '-',
        s.status === 'active' ? 'Ativo' : 'Inativo',
        s.guardian_name || '-',
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [34, 139, 34] },
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=alunos.pdf',
      },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Alunos');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=alunos.xlsx',
    },
  });
}

async function exportAttendanceReport(format: string) {
  const records = await db.attendanceRecord.findMany({
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
    take: 5000,
  });

  const data = records.map((r) => ({
    Aluno: r.student.full_name,
    Escola: r.student.school.name,
    Série: r.student.grade || '-',
    Turma: r.student.class || '-',
    Data: new Date(r.date).toLocaleDateString('pt-BR'),
    Status: r.status === 'present' ? 'Presente' : 'Ausente',
  }));

  if (format === 'pdf') {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Relatório de Frequência', 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [['Aluno', 'Escola', 'Série', 'Turma', 'Data', 'Status']],
      body: records.map((r) => [
        r.student.full_name,
        r.student.school.name,
        r.student.grade || '-',
        r.student.class || '-',
        new Date(r.date).toLocaleDateString('pt-BR'),
        r.status === 'present' ? 'Presente' : 'Ausente',
      ]),
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
  }

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

async function exportSchools(format: string) {
  const schools = await db.school.findMany({
    include: {
      _count: { select: { students: true } },
    },
    orderBy: { name: 'asc' },
  });

  const data = schools.map((s) => ({
    Nome: s.name,
    Endereço: s.address || '-',
    Telefone: s.phone || '-',
    Email: s.email || '-',
    Diretor: s.director_name || '-',
    'Total Alunos': s._count.students,
  }));

  if (format === 'pdf') {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Relatório de Escolas', 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [['Nome', 'Endereço', 'Telefone', 'Diretor', 'Total Alunos']],
      body: schools.map((s) => [
        s.name,
        s.address || '-',
        s.phone || '-',
        s.director_name || '-',
        s._count.students,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [34, 139, 34] },
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=escolas.pdf',
      },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Escolas');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=escolas.xlsx',
    },
  });
}
