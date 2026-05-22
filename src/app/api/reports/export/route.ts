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
      return await exportStudentsGrouped(format, searchParams);
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

// ─── Students grouped by school ─────────────────────────────────────
async function exportStudentsGrouped(format: string, searchParams: URLSearchParams) {
  const status = searchParams.get('status') || '';
  const school_id = searchParams.get('school_id') || '';
  const grade = searchParams.get('grade') || '';
  const classFilter = searchParams.get('class') || '';
  const sortOrder = searchParams.get('sort') || 'asc';

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (school_id) where.school_id = school_id;
  if (grade) where.grade = grade;
  if (classFilter) where.class = classFilter;

  const students = await db.student.findMany({
    where,
    include: {
      school: { select: { id: true, name: true } },
    },
    orderBy: [
      { school: { name: 'asc' } },
      { full_name: sortOrder === 'desc' ? 'desc' : 'asc' },
    ],
    take: 10000,
  });

  // Group by school
  const schoolMap = new Map<string, typeof students>();
  for (const s of students) {
    const name = s.school.name;
    if (!schoolMap.has(name)) schoolMap.set(name, []);
    schoolMap.get(name)!.push(s);
  }
  const sortedSchools = Array.from(schoolMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], 'pt-BR')
  );

  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(18);
    doc.text('Relatório de Alunos por Escola', 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

    let y = 35;

    for (const [schoolName, schoolStudents] of sortedSchools) {
      // Check if we need a new page
      if (y > 170) {
        doc.addPage();
        y = 20;
      }

      // School header
      doc.setFontSize(13);
      doc.setTextColor(34, 139, 34);
      doc.text(`📚 ${schoolName}`, 14, y);
      y += 2;

      const tableBody = schoolStudents.map((s, i) => [
        i + 1,
        s.full_name,
        s.cpf || '-',
        s.grade || '-',
        s.class || '-',
        s.status === 'active' ? 'Ativo' : 'Inativo',
        s.guardian_name || '-',
        s.phone || '-',
      ]);

      autoTable(doc, {
        startY: y,
        head: [['#', 'Nome', 'CPF', 'Série', 'Turma', 'Status', 'Responsável', 'Telefone']],
        body: tableBody,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [34, 139, 34] },
        margin: { left: 14 },
      });

      // Get the Y position after the table
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

      // Subtotal
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(`Total: ${schoolStudents.length} aluno(s)`, 14, y);
      y += 10;
    }

    // Grand total
    if (y > 180) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setTextColor(34, 139, 34);
    doc.text(`📊 Total Geral: ${students.length} aluno(s)`, 14, y);

    // Footer on each page
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
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
        'Content-Disposition': 'attachment; filename=alunos-por-escola.pdf',
      },
    });
  }

  // Excel: each school on a separate sheet
  const wb = XLSX.utils.book_new();

  for (const [schoolName, schoolStudents] of sortedSchools) {
    const data = schoolStudents.map((s, i) => ({
      '#': i + 1,
      Nome: s.full_name,
      CPF: s.cpf || '-',
      RG: s.rg || '-',
      'Data Nascimento': s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString('pt-BR') : '-',
      Série: s.grade || '-',
      Turma: s.class || '-',
      Status: s.status === 'active' ? 'Ativo' : 'Inativo',
      Telefone: s.phone || '-',
      Responsável: s.guardian_name || '-',
      'Tel. Responsável': s.guardian_phone || '-',
    }));

    // Add subtotal row
    data.push({
      '#': 0,
      Nome: `TOTAL: ${schoolStudents.length} aluno(s)`,
      CPF: '', RG: '', 'Data Nascimento': '', Série: '', Turma: '', Status: '', Telefone: '', Responsável: '', 'Tel. Responsável': '',
    });

    const ws = XLSX.utils.json_to_sheet(data);
    // Sheet name max 31 chars, no special chars
    const sheetName = schoolName.replace(/[\\/*?[\]:]/g, '').substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // Add summary sheet
  const summaryData = sortedSchools.map(([schoolName, schoolStudents]) => ({
    Escola: schoolName,
    'Total de Alunos': schoolStudents.length,
  }));
  summaryData.push({
    Escola: 'TOTAL GERAL',
    'Total de Alunos': students.length,
  });
  const summaryWs = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumo');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=alunos-por-escola.xlsx',
    },
  });
}

// ─── Attendance report ──────────────────────────────────────────────
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
    take: 10000,
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

// ─── Schools report ──────────────────────────────────────────────────
async function exportSchools(format: string) {
  const schools = await db.school.findMany({
    include: {
      _count: { select: { students: true } },
    },
    orderBy: { name: 'asc' },
    take: 10000,
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
