import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { canUserAccessSchool } from '@/lib/user-schools';
import { logAction } from '@/lib/logger';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// ── NUCA brand colors ────────────────────────────────────────────────────────
const TEAL: [number, number, number] = [13, 148, 136];       // #0d9488
const TEAL_DARK: [number, number, number] = [10, 110, 100];  // darker teal
const DARK_TEXT: [number, number, number] = [40, 40, 40];
const LIGHT_GRAY: [number, number, number] = [248, 248, 248];
const MID_GRAY: [number, number, number] = [140, 140, 140];
const WHITE: [number, number, number] = [255, 255, 255];

// ── Document type labels (Portuguese) ────────────────────────────────────────
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  birth_certificate: 'Certidão de Nascimento',
  residence_proof: 'Comprovante de Residência',
  vaccination_card: 'Cartão de Vacinação',
  photo_3x4: 'Foto 3x4',
  rg_copy: 'Cópia do RG',
  cpf_copy: 'Cópia do CPF',
  medical_report: 'Relatório Médico',
  enrollment_form: 'Ficha de Matrícula',
  income_proof: 'Comprovante de Renda',
  other: 'Outro',
};

const REQUIRED_DOCUMENTS = [
  'birth_certificate',
  'residence_proof',
  'vaccination_card',
  'photo_3x4',
  'rg_copy',
  'cpf_copy',
  'medical_report',
  'enrollment_form',
  'income_proof',
];

/**
 * GET /api/students/[id]/profile-pdf
 *
 * Generates a printable student profile PDF ("Ficha do Aluno") with all
 * related data: personal info, school, guardian, medical, documents,
 * attendance summary, event participations, and badges.
 *
 * Requires authentication (withAuth).
 */
export const GET = withAuth(async (req: AuthenticatedRequest, context?) => {
  try {
    const { id } = await context!.params;

    // ── Fetch student with all related data ──
    const student = await db.student.findUnique({
      where: { id },
      include: {
        school: {
          select: {
            name: true,
            address: true,
            phone: true,
            email: true,
            director_name: true,
          },
        },
        attendance_records: {
          orderBy: { date: 'desc' },
          take: 30,
          include: { user: { select: { full_name: true } } },
        },
        event_participations: {
          include: { event: { select: { title: true, date: true } } },
        },
        badges: true,
        dropout_risk_assessments: {
          orderBy: { calculated_at: 'desc' },
          take: 1,
        },
        documents: true,
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'Aluno não encontrado' },
        { status: 404 }
      );
    }

    // Non-admins can only access students in schools they have access to
    const canAccess = await canUserAccessSchool(
      req.user!.userId,
      req.user!.role,
      student.school_id
    );
    if (!canAccess) {
      return NextResponse.json(
        { error: 'Aluno não encontrado' },
        { status: 404 }
      );
    }

    // ── Build the PDF (A4 landscape) ──
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();   // 297mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    // ── Helper: draw header on every page ──
    const drawHeader = () => {
      // Top teal bar
      doc.setFillColor(...TEAL);
      doc.rect(0, 0, pageWidth, 22, 'F');

      // Organization name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...WHITE);
      doc.text('NUCA - Núcleo de Cidadania de Adolescentes', margin, 12);

      // Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Ficha do Aluno - Perfil Completo', margin, 18);

      // Date on the right
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      doc.setFontSize(8);
      doc.text(`Gerado em: ${dateStr}`, pageWidth - margin, 12, { align: 'right' });
    };

    // ── Helper: draw footer on every page ──
    const drawFooter = (pageNum: number, totalPages: number) => {
      const footerY = pageHeight - 10;

      // Thin teal line
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.4);
      doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MID_GRAY);
      doc.text(
        'Documento gerado automaticamente pelo sistema NUCA',
        margin,
        footerY
      );
      doc.text(
        `Página ${pageNum} de ${totalPages}`,
        pageWidth - margin,
        footerY,
        { align: 'right' }
      );
    };

    // ── Helper: section title ──
    const drawSectionTitle = (title: string, y: number): number => {
      // Teal left bar
      doc.setFillColor(...TEAL);
      doc.rect(margin, y, 3, 6, 'F');

      // Title text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...TEAL_DARK);
      doc.text(title, margin + 6, y + 4.5);

      // Underline
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.3);
      doc.line(margin, y + 7, pageWidth - margin, y + 7);

      return y + 11;
    };

    // ── Helper: key-value pair row ──
    const drawField = (
      label: string,
      value: string | null | undefined,
      x: number,
      y: number,
      labelWidth: number = 40,
      valueMaxWidth: number = 80
    ): number => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...TEAL_DARK);
      doc.text(label, x, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...DARK_TEXT);
      const displayValue = value || '—';

      // Truncate if too long
      let truncated = displayValue;
      if (doc.getTextWidth(truncated) > valueMaxWidth) {
        while (
          truncated.length > 0 &&
          doc.getTextWidth(truncated + '…') > valueMaxWidth
        ) {
          truncated = truncated.slice(0, -1);
        }
        truncated += '…';
      }
      doc.text(truncated, x + labelWidth, y);

      return y;
    };

    // ── Helper: status badge ──
    const drawStatusBadge = (status: string, x: number, y: number) => {
      const isActive = status === 'active';
      const bgColor: [number, number, number] = isActive ? [16, 185, 129] : [239, 68, 68];
      const text = isActive ? 'Ativo' : 'Inativo';
      const textW = doc.getTextWidth(text);

      doc.setFillColor(...bgColor);
      doc.roundedRect(x, y - 3, textW + 6, 5, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...WHITE);
      doc.text(text, x + 3, y + 0.5);
    };

    // ── Helper: check if we need a new page ──
    const checkNewPage = (currentY: number, neededSpace: number = 20): number => {
      if (currentY + neededSpace > pageHeight - 18) {
        doc.addPage();
        drawHeader();
        return 30;
      }
      return currentY;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // PAGE 1 — Student Info
    // ══════════════════════════════════════════════════════════════════════════
    drawHeader();

    let y = 28;

    // ── Student Information Section ──
    y = drawSectionTitle('Dados do Aluno', y);

    // Row 1: Name + Status
    drawField('Nome:', student.full_name, margin, y, 14, 120);
    drawStatusBadge(student.status, margin + 160, y);
    y += 7;

    // Row 2: CPF + RG
    drawField('CPF:', student.cpf, margin, y, 14, 60);
    drawField('RG:', student.rg, margin + 90, y, 14, 60);
    y += 7;

    // Row 3: DOB + Blood Type + Class + Grade
    const dobStr = student.date_of_birth
      ? new Date(student.date_of_birth).toLocaleDateString('pt-BR')
      : null;
    drawField('Data Nasc.:', dobStr, margin, y, 22, 45);
    drawField('Tipo Sanguíneo:', student.blood_type, margin + 75, y, 32, 30);
    drawField('Turma:', student.class, margin + 145, y, 14, 30);
    drawField('Série:', student.grade, margin + 195, y, 12, 30);
    y += 7;

    // Row 4: Phone + Address
    drawField('Telefone:', student.phone, margin, y, 20, 60);
    drawField('Endereço:', student.address, margin + 90, y, 20, 160);
    y += 12;

    // ── School Section ──
    y = checkNewPage(y, 30);
    y = drawSectionTitle('Escola', y);

    drawField('Escola:', student.school.name, margin, y, 16, 120);
    y += 7;
    drawField('Endereço:', student.school.address, margin, y, 20, 120);
    drawField('Telefone:', student.school.phone, margin + 150, y, 20, 60);
    y += 7;
    drawField('Email:', student.school.email, margin, y, 16, 120);
    drawField('Diretor(a):', student.school.director_name, margin + 150, y, 22, 60);
    y += 12;

    // ── Guardian Section ──
    y = checkNewPage(y, 30);
    y = drawSectionTitle('Responsável', y);

    drawField('Nome:', student.guardian_name, margin, y, 16, 120);
    drawField('Telefone:', student.guardian_phone, margin + 145, y, 20, 60);
    y += 7;
    drawField('Email:', student.guardian_email, margin, y, 16, 120);
    drawField('Contato Emergência:', student.emergency_contact, margin + 145, y, 36, 60);
    y += 12;

    // ── Medical Section ──
    y = checkNewPage(y, 30);
    y = drawSectionTitle('Informações Médicas', y);

    drawField('Necessidades Especiais:', student.special_needs, margin, y, 40, 120);
    y += 7;
    drawField('Medicações:', student.medications, margin, y, 22, 120);
    drawField('Tipo Sanguíneo:', student.blood_type, margin + 150, y, 32, 30);
    y += 12;

    // ── Dropout Risk Section ──
    if (student.dropout_risk_assessments.length > 0) {
      y = checkNewPage(y, 20);
      y = drawSectionTitle('Avaliação de Risco de Evasão', y);

      const risk = student.dropout_risk_assessments[0];
      const riskLevelLabels: Record<string, string> = {
        low: 'Baixo',
        attention: 'Atenção',
        medium: 'Médio',
        high: 'Alto',
      };

      drawField('Nível de Risco:', riskLevelLabels[risk.risk_level] || risk.risk_level, margin, y, 28, 40);
      drawField('Pontuação:', `${Math.round(risk.score)}%`, margin + 80, y, 22, 20);
      drawField('Frequência:', `${risk.attendance_percentage.toFixed(1)}%`, margin + 130, y, 22, 20);
      drawField('Faltas Consecutivas:', String(risk.consecutive_absences), margin + 180, y, 38, 15);
      y += 7;

      const calcDate = new Date(risk.calculated_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      drawField('Calculado em:', calcDate, margin, y, 28, 40);
      y += 12;
    }

    // ── Documents Checklist ──
    y = checkNewPage(y, 40);
    y = drawSectionTitle('Checklist de Documentos', y);

    // Build table data for documents
    const docMap = new Map<string, string>();
    for (const d of student.documents) {
      const statusLabel =
        d.status === 'verified' ? 'Verificado' :
        d.status === 'delivered' ? 'Entregue' : 'Pendente';
      docMap.set(d.document_type, statusLabel);
    }

    const docTableBody = REQUIRED_DOCUMENTS.map((docType) => {
      const label = DOCUMENT_TYPE_LABELS[docType] || docType;
      const status = docMap.get(docType);
      const symbol = status === 'Verificado' ? '✓' : status === 'Entregue' ? '✓' : '✗';
      const statusText = status || 'Pendente';
      return [label, statusText, symbol];
    });

    // Add any extra documents not in the standard list
    for (const d of student.documents) {
      if (!REQUIRED_DOCUMENTS.includes(d.document_type)) {
        const label = DOCUMENT_TYPE_LABELS[d.document_type] || d.document_type;
        const statusLabel =
          d.status === 'verified' ? 'Verificado' :
          d.status === 'delivered' ? 'Entregue' : 'Pendente';
        const symbol = d.status === 'verified' || d.status === 'delivered' ? '✓' : '✗';
        docTableBody.push([label, statusLabel, symbol]);
      }
    }

    autoTable(doc, {
      startY: y,
      head: [['Documento', 'Status', '']],
      body: docTableBody,
      theme: 'grid',
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 50, halign: 'center' },
        2: { cellWidth: 15, halign: 'center' },
      },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2,
        lineColor: [210, 210, 210],
        lineWidth: 0.2,
        textColor: DARK_TEXT,
        fillColor: WHITE,
      },
      headStyles: {
        fillColor: TEAL,
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: LIGHT_GRAY,
      },
      didParseCell: (data) => {
        // Color the check/cross symbols
        if (data.column.index === 2 && data.section === 'body') {
          const val = data.cell.raw as string;
          if (val === '✓') {
            data.cell.styles.textColor = [16, 185, 129] as [number, number, number];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === '✗') {
            data.cell.styles.textColor = [239, 68, 68] as [number, number, number];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    // Get the Y after the table
    y = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable.finalY + 10;

    // ── Attendance Summary ──
    y = checkNewPage(y, 40);
    y = drawSectionTitle('Resumo de Frequência (Últimos 30 registros)', y);

    const totalRecords = student.attendance_records.length;
    const presentCount = student.attendance_records.filter(
      (r) => r.status === 'present'
    ).length;
    const absentCount = totalRecords - presentCount;
    const attendancePct = totalRecords > 0 ? ((presentCount / totalRecords) * 100).toFixed(1) : '0.0';

    const attendanceBody = [
      ['Total de Registros', String(totalRecords)],
      ['Presenças', String(presentCount)],
      ['Faltas', String(absentCount)],
      ['Percentual de Frequência', `${attendancePct}%`],
    ];

    autoTable(doc, {
      startY: y,
      head: [['Indicador', 'Valor']],
      body: attendanceBody,
      theme: 'grid',
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 50, halign: 'center' },
      },
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 2.5,
        lineColor: [210, 210, 210],
        lineWidth: 0.2,
        textColor: DARK_TEXT,
        fillColor: WHITE,
      },
      headStyles: {
        fillColor: TEAL,
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: LIGHT_GRAY,
      },
    });

    y = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable.finalY + 10;

    // ── Event Participations ──
    y = checkNewPage(y, 30);
    y = drawSectionTitle('Participações em Eventos', y);

    if (student.event_participations.length > 0) {
      const eventBody = student.event_participations.map((p) => {
        const eventDate = new Date(p.event.date).toLocaleDateString('pt-BR');
        const attendedLabel = p.attended ? 'Sim' : 'Não';
        return [p.event.title, eventDate, attendedLabel];
      });

      autoTable(doc, {
        startY: y,
        head: [['Evento', 'Data', 'Presente']],
        body: eventBody,
        theme: 'grid',
        margin: { left: margin, right: margin },
        columnStyles: {
          0: { cellWidth: 120 },
          1: { cellWidth: 40, halign: 'center' },
          2: { cellWidth: 30, halign: 'center' },
        },
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 2,
          lineColor: [210, 210, 210],
          lineWidth: 0.2,
          textColor: DARK_TEXT,
          fillColor: WHITE,
        },
        headStyles: {
          fillColor: TEAL,
          textColor: WHITE,
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'center',
        },
        alternateRowStyles: {
          fillColor: LIGHT_GRAY,
        },
      });

      y = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable.finalY + 10;
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...MID_GRAY);
      doc.text('Nenhuma participação registrada', margin, y);
      y += 10;
    }

    // ── Badges Section ──
    if (student.badges.length > 0) {
      y = checkNewPage(y, 25);
      y = drawSectionTitle('Conquistas / Badges', y);

      const badgeLabels: Record<string, string> = {
        '5_events': '5 Eventos',
        '10_events': '10 Eventos',
        '20_events': '20 Eventos',
        monthly_winner: 'Vencedor do Mês',
      };

      const badgeBody = student.badges.map((b) => {
        const label = badgeLabels[b.badge_type] || b.badge_type;
        const earnedDate = new Date(b.earned_at).toLocaleDateString('pt-BR');
        return [label, earnedDate];
      });

      autoTable(doc, {
        startY: y,
        head: [['Conquista', 'Data de Obtenção']],
        body: badgeBody,
        theme: 'grid',
        margin: { left: margin, right: margin },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 50, halign: 'center' },
        },
        styles: {
          font: 'helvetica',
          fontSize: 9,
          cellPadding: 2.5,
          lineColor: [210, 210, 210],
          lineWidth: 0.2,
          textColor: DARK_TEXT,
          fillColor: WHITE,
        },
        headStyles: {
          fillColor: TEAL,
          textColor: WHITE,
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'center',
        },
        alternateRowStyles: {
          fillColor: LIGHT_GRAY,
        },
      });
    }

    // ── Add footers to all pages ──
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(i, totalPages);
    }

    // ── Audit log ──
    await logAction(
      req.user!.userId,
      'export_report',
      `Geração de ficha do aluno (PDF): ${student.full_name}`,
      req
    );

    // ── Return PDF ──
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const safeName = student.full_name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'aluno';

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ficha-aluno_${safeName}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Student profile PDF error:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar ficha do aluno' },
      { status: 500 }
    );
  }
});
