import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Green brand color
const BRAND_GREEN = [22, 163, 74] as [number, number, number]; // emerald-600
const BRAND_GREEN_LIGHT = [34, 197, 94] as [number, number, number]; // emerald-500
const DARK_TEXT = [30, 30, 30] as [number, number, number];
const GRAY_TEXT = [120, 120, 120] as [number, number, number];

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
      school: { select: { id: true, name: true, address: true, phone: true, director_name: true } },
    },
    orderBy: [
      { school: { name: 'asc' } },
      { full_name: sortOrder === 'desc' ? 'desc' : 'asc' },
    ],
    take: 10000,
  });

  // Group by school
  const schoolMap = new Map<string, { name: string; address: string | null; phone: string | null; director: string | null; students: typeof students }>();
  for (const s of students) {
    const sid = s.school.id;
    if (!schoolMap.has(sid)) {
      schoolMap.set(sid, {
        name: s.school.name,
        address: s.school.address,
        phone: s.school.phone,
        director: s.school.director_name,
        students: [],
      });
    }
    schoolMap.get(sid)!.students.push(s);
  }
  const sortedSchools = Array.from(schoolMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR')
  );

  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = 0;

    // ── Cover / Title ──
    y = 20;
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, pageWidth, 45, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('Relatorio de Alunos por Escola', margin, 22);
    doc.setFontSize(11);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} as ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, margin, 34);
    doc.setFontSize(10);
    doc.text(`Total: ${students.length} aluno(s) em ${sortedSchools.length} escola(s)`, margin, 41);

    y = 55;
    doc.setTextColor(...DARK_TEXT);

    // ── School sections ──
    for (let si = 0; si < sortedSchools.length; si++) {
      const school = sortedSchools[si];
      const schoolStudents = school.students;

      // Check if enough space for header + at least 3 rows
      const estimatedTableHeight = 20 + Math.min(schoolStudents.length, 3) * 7;
      if (y + estimatedTableHeight > pageHeight - 25) {
        doc.addPage();
        y = 20;
      }

      // School header bar
      doc.setFillColor(236, 253, 245); // emerald-50
      doc.rect(margin, y - 5, pageWidth - margin * 2, 12, 'F');
      doc.setDrawColor(...BRAND_GREEN_LIGHT);
      doc.setLineWidth(0.5);
      doc.line(margin, y - 5, margin, y + 7); // left accent bar

      doc.setFontSize(13);
      doc.setTextColor(...BRAND_GREEN);
      doc.text(school.name, margin + 4, y + 3);

      // School info on the right
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_TEXT);
      const infoParts: string[] = [];
      if (school.director) infoParts.push(`Diretor(a): ${school.director}`);
      if (school.phone) infoParts.push(`Tel: ${school.phone}`);
      if (infoParts.length > 0) {
        doc.text(infoParts.join('  |  '), pageWidth - margin - 2, y + 3, { align: 'right' });
      }

      y += 12;

      // Student table
      const tableBody = schoolStudents.map((s, i) => [
        String(i + 1),
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
        head: [['#', 'Nome', 'CPF', 'Serie', 'Turma', 'Status', 'Responsavel', 'Telefone']],
        body: tableBody,
        styles: {
          fontSize: 7,
          cellPadding: 2,
          lineColor: [220, 220, 220] as [number, number, number],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: BRAND_GREEN,
          textColor: [255, 255, 255] as [number, number, number],
          fontStyle: 'bold',
          fontSize: 7.5,
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251] as [number, number, number],
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 'auto' },
          5: { halign: 'center' },
        },
        margin: { left: margin, right: margin },
        tableWidth: pageWidth - margin * 2,
      });

      // Get Y after table
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;

      // Subtotal
      doc.setFillColor(236, 253, 245);
      const subtotalWidth = pageWidth - margin * 2;
      doc.rect(margin, y - 1, subtotalWidth, 8, 'F');
      doc.setFontSize(9);
      doc.setTextColor(...BRAND_GREEN);
      doc.text(`Subtotal: ${schoolStudents.length} aluno(s)`, margin + 4, y + 4.5);

      y += 14;

      // Separator between schools (not after last)
      if (si < sortedSchools.length - 1) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(margin, y - 4, pageWidth - margin, y - 4);
        y += 2;
      }
    }

    // ── Grand Total ──
    if (y + 20 > pageHeight - 15) {
      doc.addPage();
      y = 20;
    }

    y += 4;
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(margin, y - 2, pageWidth - margin * 2, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text(`TOTAL GERAL: ${students.length} aluno(s) em ${sortedSchools.length} escola(s)`, margin + 4, y + 7);

    // ── Footer on each page ──
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
        'Content-Disposition': 'attachment; filename=alunos-por-escola.pdf',
      },
    });
  }

  // ── Excel: each school on a separate sheet ──
  const wb = XLSX.utils.book_new();

  for (const school of sortedSchools) {
    const data = school.students.map((s, i) => ({
      '#': i + 1,
      'Nome': s.full_name,
      'CPF': s.cpf || '-',
      'RG': s.rg || '-',
      'Data Nascimento': s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString('pt-BR') : '-',
      'Serie': s.grade || '-',
      'Turma': s.class || '-',
      'Status': s.status === 'active' ? 'Ativo' : 'Inativo',
      'Telefone': s.phone || '-',
      'Responsavel': s.guardian_name || '-',
      'Tel. Responsavel': s.guardian_phone || '-',
    }));

    // Add subtotal row
    data.push({
      '#': 0,
      'Nome': `TOTAL: ${school.students.length} aluno(s)`,
      'CPF': '', 'RG': '', 'Data Nascimento': '', 'Serie': '', 'Turma': '', 'Status': '', 'Telefone': '', 'Responsavel': '', 'Tel. Responsavel': '',
    });

    const ws = XLSX.utils.json_to_sheet(data);
    // Sheet name max 31 chars, no special chars
    const sheetName = school.name.replace(/[\\/*?[\]:]/g, '').substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // Add summary sheet
  const summaryData = sortedSchools.map((school) => ({
    'Escola': school.name,
    'Total de Alunos': school.students.length,
  }));
  summaryData.push({
    'Escola': 'TOTAL GERAL',
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
    Serie: r.student.grade || '-',
    Turma: r.student.class || '-',
    Data: new Date(r.date).toLocaleDateString('pt-BR'),
    Status: r.status === 'present' ? 'Presente' : 'Ausente',
  }));

  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Header bar
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('Relatorio de Frequencia', 14, 18);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

    autoTable(doc, {
      startY: 42,
      head: [['Aluno', 'Escola', 'Serie', 'Turma', 'Data', 'Status']],
      body: records.map((r) => [
        r.student.full_name,
        r.student.school.name,
        r.student.grade || '-',
        r.student.class || '-',
        new Date(r.date).toLocaleDateString('pt-BR'),
        r.status === 'present' ? 'Presente' : 'Ausente',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] as [number, number, number] },
      margin: { left: 14, right: 14 },
    });

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
        'Content-Disposition': 'attachment; filename=frequencia.pdf',
      },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Frequencia');
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
    Endereco: s.address || '-',
    Telefone: s.phone || '-',
    Email: s.email || '-',
    Diretor: s.director_name || '-',
    'Total Alunos': s._count.students,
  }));

  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Header bar
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('Relatorio de Escolas', 14, 18);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

    autoTable(doc, {
      startY: 42,
      head: [['Nome', 'Endereco', 'Telefone', 'Email', 'Diretor', 'Total Alunos']],
      body: schools.map((s) => [
        s.name,
        s.address || '-',
        s.phone || '-',
        s.email || '-',
        s.director_name || '-',
        s._count.students,
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] as [number, number, number] },
      margin: { left: 14, right: 14 },
    });

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
