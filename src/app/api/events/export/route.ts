import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { getUserSchoolIds, canUserAccessSchool } from '@/lib/user-schools';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Green brand color
const BRAND_GREEN = [22, 163, 74] as [number, number, number];
const GRAY_TEXT = [120, 120, 120] as [number, number, number];
const DARK_TEXT = [30, 30, 30] as [number, number, number];

export const GET = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || '';
    const format = searchParams.get('format') || 'excel';
    const event_id = searchParams.get('event_id') || '';
    const student_id = searchParams.get('student_id') || '';
    const school_id = searchParams.get('school_id') || '';

    if (!['participants', 'ranking', 'student_report', 'school_report'].includes(type)) {
      return NextResponse.json(
        { error: 'Tipo de relatório inválido. Use: participants, ranking, student_report, school_report' },
        { status: 400 }
      );
    }

    if (!['pdf', 'excel'].includes(format)) {
      return NextResponse.json(
        { error: 'Formato inválido. Use: pdf ou excel' },
        { status: 400 }
      );
    }

    await logAction(req.user!.userId, 'export_report', `Exportação de relatório de eventos (${type}, ${format})`, req);

    // ── School scoping (VULN-3 FIX) ──
    // Non-admins are restricted to their assigned schools. The downstream
    // helper functions enforce this per-entity (event_id / student_id /
    // school_id); we also resolve the allowed list here so ranking (which
    // has no explicit entity) can be scoped.
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const allowedSchoolIds = await getUserSchoolIds(userId, userRole);

    switch (type) {
      case 'participants':
        if (!event_id) {
          return NextResponse.json({ error: 'event_id é obrigatório para relatório de participantes' }, { status: 400 });
        }
        return await exportParticipants(format, event_id, userId, userRole);
      case 'ranking':
        return await exportRanking(format, allowedSchoolIds);
      case 'student_report':
        if (!student_id) {
          return NextResponse.json({ error: 'student_id é obrigatório para relatório de aluno' }, { status: 400 });
        }
        return await exportStudentReport(format, student_id, userId, userRole);
      case 'school_report':
        if (!school_id) {
          return NextResponse.json({ error: 'school_id é obrigatório para relatório de escola' }, { status: 400 });
        }
        return await exportSchoolReport(format, school_id, userId, userRole);
      default:
        return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }
  } catch (error) {
    console.error('Export events report error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

// ─── Participants Export ──────────────────────────────────────────
async function exportParticipants(
  format: string,
  event_id: string,
  userId: string,
  userRole: string
) {
  const event = await db.event.findUnique({
    where: { id: event_id },
    include: { school: { select: { name: true } } },
  });

  if (!event) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  // VULN-3 FIX: if the event belongs to a specific school, verify the
  // caller has access to that school. Events without a school_id are
  // considered cross-school / global and remain accessible to all.
  if (event.school_id) {
    const canAccess = await canUserAccessSchool(userId, userRole, event.school_id);
    if (!canAccess) {
      return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    }
  }

  const participants = await db.eventParticipant.findMany({
    where: { event_id },
    include: {
      student: {
        select: {
          id: true,
          full_name: true,
          grade: true,
          class: true,
          school: { select: { name: true } },
        },
      },
    },
    orderBy: { student: { full_name: 'asc' } },
  });

  const data = participants.map((p, i) => ({
    '#': i + 1,
    'Nome': p.student.full_name,
    'Escola': p.student.school?.name || '-',
    'Série': p.student.grade || '-',
    'Turma': p.student.class || '-',
    'Presença': p.attended ? 'Presente' : 'Ausente',
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
    doc.setFont('helvetica', 'bold');
    doc.text('Participantes do Evento', 14, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Evento: ${event.title} | Data: ${new Date(event.date).toLocaleDateString('pt-BR')}`, 14, 28);

    autoTable(doc, {
      startY: 42,
      head: [['#', 'Nome', 'Escola', 'Série', 'Turma', 'Presença']],
      body: participants.map((p, i) => [
        String(i + 1),
        p.student.full_name,
        p.student.school?.name || '-',
        p.student.grade || '-',
        p.student.class || '-',
        p.attended ? 'Presente' : 'Ausente',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] as [number, number, number] },
      margin: { left: 14, right: 14 },
    });

    addFooter(doc, pageWidth, pageHeight);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=participantes-${event.title.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      },
    });
  }

  // Excel
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Participantes');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=participantes-${event.title.replace(/\s+/g, '-').toLowerCase()}.xlsx`,
    },
  });
}

// ─── Ranking Export ───────────────────────────────────────────────
async function exportRanking(
  format: string,
  allowedSchoolIds: string[] | null
) {
  // VULN-3 FIX: scope the participation query to the caller's allowed
  // schools. `allowedSchoolIds === null` means Admin (no filter).
  const participations = await db.eventParticipant.findMany({
    where:
      allowedSchoolIds !== null
        ? { student: { school_id: { in: allowedSchoolIds } } }
        : {},
    select: {
      student_id: true,
      student: {
        select: {
          full_name: true,
          school: { select: { name: true } },
        },
      },
    },
  });

  // Count by student
  const countMap = new Map<string, { full_name: string; school_name: string; total: number }>();
  for (const p of participations) {
    const existing = countMap.get(p.student_id);
    if (existing) {
      existing.total++;
    } else {
      countMap.set(p.student_id, {
        full_name: p.student.full_name,
        school_name: p.student.school?.name || '-',
        total: 1,
      });
    }
  }

  const ranking = Array.from(countMap.entries())
    .map(([id, val]) => ({ student_id: id, ...val }))
    .sort((a, b) => b.total - a.total);

  const data = ranking.map((r, i) => ({
    'Pos.': i + 1,
    'Nome': r.full_name,
    'Escola': r.school_name,
    'Total Eventos': r.total,
  }));

  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Ranking de Participação', 14, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

    autoTable(doc, {
      startY: 42,
      head: [['Pos.', 'Nome', 'Escola', 'Total Eventos']],
      body: ranking.map((r, i) => [
        String(i + 1),
        r.full_name,
        r.school_name,
        String(r.total),
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] as [number, number, number] },
      margin: { left: 14, right: 14 },
    });

    addFooter(doc, pageWidth, pageHeight);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=ranking-participacao.pdf',
      },
    });
  }

  // Excel
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Ranking');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=ranking-participacao.xlsx',
    },
  });
}

// ─── Student Report Export ────────────────────────────────────────
async function exportStudentReport(
  format: string,
  student_id: string,
  userId: string,
  userRole: string
) {
  const student = await db.student.findUnique({
    where: { id: student_id },
    include: { school: { select: { name: true } } },
  });

  if (!student) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  // VULN-3 FIX: verify the caller has access to the student's school.
  const canAccess = await canUserAccessSchool(userId, userRole, student.school_id);
  if (!canAccess) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const participations = await db.eventParticipant.findMany({
    where: { student_id },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          date: true,
          location: true,
          category: true,
          status: true,
        },
      },
    },
    orderBy: { event: { date: 'desc' } },
  });

  const data = participations.map((p, i) => ({
    '#': i + 1,
    'Evento': p.event.title,
    'Data': new Date(p.event.date).toLocaleDateString('pt-BR'),
    'Local': p.event.location || '-',
    'Categoria': p.event.category || 'other',
    'Presença': p.attended ? 'Presente' : 'Ausente',
  }));

  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Header bar
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, pageWidth, 50, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório do Aluno', 14, 18);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Aluno: ${student.full_name}`, 14, 30);
    doc.text(`Escola: ${student.school?.name || '-'} | Série: ${student.grade || '-'} | Turma: ${student.class || '-'}`, 14, 40);

    autoTable(doc, {
      startY: 56,
      head: [['#', 'Evento', 'Data', 'Local', 'Categoria', 'Presença']],
      body: participations.map((p, i) => [
        String(i + 1),
        p.event.title,
        new Date(p.event.date).toLocaleDateString('pt-BR'),
        p.event.location || '-',
        p.event.category || 'other',
        p.attended ? 'Presente' : 'Ausente',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] as [number, number, number] },
      margin: { left: 14, right: 14 },
    });

    // Summary
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    if (finalY < pageHeight - 30) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...DARK_TEXT);
      doc.text(`Total de eventos: ${participations.length}`, 14, finalY);
      const attended = participations.filter(p => p.attended).length;
      doc.text(`Presenças: ${attended} | Faltas: ${participations.length - attended}`, 14, finalY + 7);
    }

    addFooter(doc, pageWidth, pageHeight);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=relatorio-${student.full_name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      },
    });
  }

  // Excel
  const wb = XLSX.utils.book_new();

  // Student info sheet
  const infoData = [
    { 'Campo': 'Nome', 'Valor': student.full_name },
    { 'Campo': 'Escola', 'Valor': student.school?.name || '-' },
    { 'Campo': 'Série', 'Valor': student.grade || '-' },
    { 'Campo': 'Turma', 'Valor': student.class || '-' },
    { 'Campo': 'Total Eventos', 'Valor': participations.length },
    { 'Campo': 'Presenças', 'Valor': participations.filter(p => p.attended).length },
  ];
  const infoWs = XLSX.utils.json_to_sheet(infoData);
  XLSX.utils.book_append_sheet(wb, infoWs, 'Info');

  // Events sheet
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Eventos');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=relatorio-${student.full_name.replace(/\s+/g, '-').toLowerCase()}.xlsx`,
    },
  });
}

// ─── School Report Export ─────────────────────────────────────────
async function exportSchoolReport(
  format: string,
  school_id: string,
  userId: string,
  userRole: string
) {
  // VULN-3 FIX: verify the caller has access to the requested school.
  const canAccessSchoolResult = await canUserAccessSchool(userId, userRole, school_id);
  if (!canAccessSchoolResult) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const school = await db.school.findUnique({
    where: { id: school_id },
  });

  if (!school) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  // Events linked to this school
  const events = await db.event.findMany({
    where: { school_id },
    include: {
      _count: { select: { participants: true } },
    },
    orderBy: { date: 'desc' },
  });

  // Students from this school who participated in any event
  const studentParticipationCount = await db.eventParticipant.findMany({
    where: {
      student: { school_id },
    },
    select: {
      student_id: true,
    },
  });

  const uniqueStudentIds = new Set(studentParticipationCount.map(p => p.student_id));

  const data = events.map((e, i) => ({
    '#': i + 1,
    'Evento': e.title,
    'Data': new Date(e.date).toLocaleDateString('pt-BR'),
    'Categoria': e.category || 'other',
    'Status': e.status,
    'Participantes': e._count.participants,
  }));

  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Header bar
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, pageWidth, 50, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório da Escola', 14, 18);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Escola: ${school.name}`, 14, 30);
    const subInfo = [
      school.address ? `End.: ${school.address}` : '',
      school.phone ? `Tel: ${school.phone}` : '',
      school.director_name ? `Diretor(a): ${school.director_name}` : '',
    ].filter(Boolean).join(' | ');
    if (subInfo) doc.text(subInfo, 14, 40);

    autoTable(doc, {
      startY: 56,
      head: [['#', 'Evento', 'Data', 'Categoria', 'Status', 'Participantes']],
      body: events.map((e, i) => [
        String(i + 1),
        e.title,
        new Date(e.date).toLocaleDateString('pt-BR'),
        e.category || 'other',
        e.status,
        String(e._count.participants),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] as [number, number, number] },
      margin: { left: 14, right: 14 },
    });

    // Stats summary
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    if (finalY < pageHeight - 40) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...DARK_TEXT);
      doc.text(`Total de eventos da escola: ${events.length}`, 14, finalY);
      doc.text(`Alunos participantes: ${uniqueStudentIds.size}`, 14, finalY + 7);
      const totalParts = events.reduce((sum, e) => sum + e._count.participants, 0);
      doc.text(`Total de participações: ${totalParts}`, 14, finalY + 14);
    }

    addFooter(doc, pageWidth, pageHeight);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=relatorio-${school.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      },
    });
  }

  // Excel
  const wb = XLSX.utils.book_new();

  // School info sheet
  const infoData = [
    { 'Campo': 'Escola', 'Valor': school.name },
    { 'Campo': 'Endereço', 'Valor': school.address || '-' },
    { 'Campo': 'Telefone', 'Valor': school.phone || '-' },
    { 'Campo': 'Diretor(a)', 'Valor': school.director_name || '-' },
    { 'Campo': 'Total Eventos', 'Valor': events.length },
    { 'Campo': 'Alunos Participantes', 'Valor': uniqueStudentIds.size },
    { 'Campo': 'Total Participações', 'Valor': studentParticipationCount.length },
  ];
  const infoWs = XLSX.utils.json_to_sheet(infoData);
  XLSX.utils.book_append_sheet(wb, infoWs, 'Info');

  // Events sheet
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Eventos');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=relatorio-${school.name.replace(/\s+/g, '-').toLowerCase()}.xlsx`,
    },
  });
}

// ─── Footer helper ────────────────────────────────────────────────
function addFooter(doc: jsPDF, pageWidth: number, pageHeight: number) {
  const pageCount = doc.getNumberOfPages();
  const generatedAt = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 10, pageWidth - 14, pageHeight - 10);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY_TEXT);
    doc.text('NUCA Plataforma', 14, pageHeight - 5);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    doc.text(generatedAt, pageWidth - 14, pageHeight - 5, { align: 'right' });
  }
}
