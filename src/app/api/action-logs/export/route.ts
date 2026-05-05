import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const GET = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'excel';
    const user_id = searchParams.get('user_id') || '';
    const action_type = searchParams.get('action_type') || '';
    const date_from = searchParams.get('date_from') || '';
    const date_to = searchParams.get('date_to') || '';

    const where: Record<string, unknown> = {};

    if (user_id) where.user_id = user_id;
    if (action_type) where.action_type = action_type;

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
      where.created_at = dateFilter;
    }

    const logs = await db.actionLog.findMany({
      where,
      include: {
        user: {
          select: { full_name: true, email: true },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 10000,
    });

    const data = logs.map((l) => ({
      Usuário: l.user?.full_name || 'Sistema',
      Email: l.user?.email || '-',
      'Tipo Ação': l.action_type,
      Descrição: l.description,
      'Endereço IP': l.ip_address || '-',
      Dispositivo: l.device || '-',
      Data: new Date(l.created_at).toLocaleString('pt-BR'),
    }));

    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(16);
      doc.text('Relatório de Logs de Ação', 14, 20);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

      autoTable(doc, {
        startY: 35,
        head: [['Usuário', 'Tipo Ação', 'Descrição', 'IP', 'Data']],
        body: logs.map((l) => [
          l.user?.full_name || 'Sistema',
          l.action_type,
          l.description.substring(0, 60),
          l.ip_address || '-',
          new Date(l.created_at).toLocaleString('pt-BR'),
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [139, 69, 19] },
      });

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=logs-acoes.pdf',
        },
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Logs');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=logs-acoes.xlsx',
      },
    });
  } catch (error) {
    console.error('Export action logs error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
