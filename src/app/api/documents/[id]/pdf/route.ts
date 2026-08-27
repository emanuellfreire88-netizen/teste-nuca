import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  oficio: 'Ofício',
  memorando: 'Memorando',
  declaracao: 'Declaração',
  convite: 'Convite',
  comunicado: 'Comunicado',
  solicitacao_transporte: 'Solicitação de Transporte',
  solicitacao_espaco: 'Solicitação de Espaço',
  solicitacao_alimentacao: 'Solicitação de Alimentação',
  encaminhamento: 'Encaminhamento',
  relatorio: 'Relatório',
  certificado: 'Certificado',
  outros: 'Documento',
};

// ─── Format date in Portuguese (capitalized month) ───
function formatDatePortuguese(date: Date): string {
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const monthCap = month.charAt(0).toUpperCase() + month.slice(1);
  const year = date.getFullYear();
  return `${day} de ${monthCap} de ${year}`;
}

// ─── Convert HTML body to plain text paragraphs ───
function htmlToParagraphs(html: string): string[] {
  if (!html) return [];
  let text = html;
  // Convert bold tags to ** markers (for the Python script to parse)
  text = text.replace(/<strong[^>]*>/gi, '**').replace(/<\/strong>/gi, '**');
  text = text.replace(/<b[^>]*>/gi, '**').replace(/<\/b>/gi, '**');
  // Paragraph breaks
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  // Line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // List items
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '• ');
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  // Split into paragraphs
  const paragraphs = text
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return paragraphs;
}

// ─── GET: Generate PDF for document using MODELO NOVO template ───
export const GET = withAuth(async (req: AuthenticatedRequest, context?: { params: Promise<Record<string, string>> }) => {
  try {
    if (!context?.params) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    const { id } = await context.params;
    const userId = req.user!.userId;

    // Fetch document
    const document = await db.docManagementDocument.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, full_name: true } },
        template: { select: { id: true, name: true, display_name: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
    }

    // Fetch config for city/uf defaults
    const configEntries = await db.docManagementConfig.findMany();
    const configMap: Record<string, string> = {};
    for (const entry of configEntries) {
      configMap[entry.config_key] = entry.config_value || '';
    }
    const defaultCity = document.city || configMap.municipio || 'Limoeiro de Anadia';
    const uf = configMap.uf || 'AL';

    // Prepare data for the Python script
    const docLabel = DOCUMENT_TYPE_LABELS[document.document_type] || 'Documento';
    const dateStr = formatDatePortuguese(new Date(document.date));
    const bodyParagraphs = htmlToParagraphs(document.body_text || '');

    const scriptData = {
      template_path: path.join(process.cwd(), 'templates', 'doc-templates', 'memorando-template.docx'),
      document_type_label: docLabel,
      number: document.number,
      year: document.year,
      city: defaultCity,
      uf,
      date_str: dateStr,
      treatment: document.recipient_treatment || '',
      recipient: document.recipient || '',
      recipient_title: document.recipient_title || '',
      institution: document.institution || '',
      subject: document.subject || '',
      vocative: document.vocative || '',
      body_paragraphs: bodyParagraphs,
      closing: document.closing || 'Atenciosamente,',
      sender_name: document.sender_name || document.signature1_name || '',
      sender_title: document.sender_title || document.signature1_title || '',
    };

    // Create temp files for the Python script communication
    const tmpDir = os.tmpdir();
    const jsonInputPath = path.join(tmpDir, `doc-input-${id}-${Date.now()}.json`);
    const pdfOutputPath = path.join(tmpDir, `doc-output-${id}-${Date.now()}.pdf`);

    // Write JSON input
    fs.writeFileSync(jsonInputPath, JSON.stringify(scriptData));

    try {
      // Call the Python script
      const scriptPath = path.join(process.cwd(), 'scripts', 'generate-doc-pdf.py');
      const { stderr } = await execFileAsync('python3', [scriptPath, jsonInputPath, pdfOutputPath], {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for output
      });

      if (stderr) {
        console.log('Python script output:', stderr);
      }

      // Check if PDF was generated
      if (!fs.existsSync(pdfOutputPath)) {
        throw new Error('PDF file was not created');
      }

      // Read the PDF
      const pdfBytes = fs.readFileSync(pdfOutputPath);

      // Clean up temp files
      try {
        fs.unlinkSync(jsonInputPath);
        fs.unlinkSync(pdfOutputPath);
      } catch {
        // Ignore cleanup errors
      }

      // Create history entry
      await db.docManagementHistory.create({
        data: {
          document_id: id,
          user_id: userId,
          action: 'pdf_generated',
          description: 'PDF gerado para o documento (template MODELO NOVO)',
        },
      });

      await logAction(userId, 'generate_pdf_doc_management', `PDF gerado para documento ${document.number_formatted}`);

      const fileName = `${document.number_formatted || document.protocol}.pdf`;

      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': String(pdfBytes.length),
        },
      });
    } finally {
      // Ensure temp files are cleaned up even on error
      try {
        if (fs.existsSync(jsonInputPath)) fs.unlinkSync(jsonInputPath);
        if (fs.existsSync(pdfOutputPath)) fs.unlinkSync(pdfOutputPath);
      } catch {
        // Ignore
      }
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar PDF' },
      { status: 500 }
    );
  }
});
