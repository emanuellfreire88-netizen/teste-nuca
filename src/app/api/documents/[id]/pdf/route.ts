import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { generateDocumentHTML, DocumentTemplateData } from '@/lib/doc-html-template';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Maximum execution time for PDF generation

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
  // Convert bold tags to ** markers
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

// ─── Lazy-load Puppeteer and Chromium (avoids bundling issues) ───
async function generatePDFFromHTML(html: string): Promise<Buffer> {
  // Dynamic imports to keep the module light
  const puppeteer = (await import('puppeteer-core')).default;
  const chromiumModule = await import('@sparticuz/chromium');
  const chromium = chromiumModule.default;

  // Configure Chromium executable path
  // In production (Vercel), @sparticuz/chromium provides the binary
  // In development, fall back to system Chrome/Chromium
  let executablePath: string | undefined;

  if (process.env.VERCEL) {
    // Running on Vercel — use @sparticuz/chromium
    executablePath = await chromium.executablePath();
  } else {
    // Local development — try to find a system browser first
    const fs = await import('fs');
    const possiblePaths = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/snap/bin/chromium',
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        executablePath = p;
        break;
      }
    }
    if (!executablePath) {
      // Fall back to @sparticuz/chromium (will inflate its bundled binary)
      try {
        executablePath = await chromium.executablePath();
      } catch (e) {
        throw new Error(
          'Nenhum navegador Chromium encontrado. Instale com: sudo apt install chromium'
        );
      }
    }
  }

  const browser = await puppeteer.launch({
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // Set A4 page size
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF with A4 size and no margins (margins handled in CSS)
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

// ─── GET: Generate PDF for document ───
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

    // Prepare template data
    const docLabel = DOCUMENT_TYPE_LABELS[document.document_type] || 'Documento';
    const dateStr = formatDatePortuguese(new Date(document.date));
    const bodyParagraphs = htmlToParagraphs(document.body_text || '');

    const templateData: DocumentTemplateData = {
      documentTypeLabel: docLabel,
      number: document.number,
      year: document.year,
      city: defaultCity,
      uf,
      dateStr,
      treatment: document.recipient_treatment || '',
      recipient: document.recipient || '',
      recipientTitle: document.recipient_title || '',
      institution: document.institution || '',
      subject: document.subject || '',
      vocative: document.vocative || '',
      bodyParagraphs,
      closing: document.closing || 'Atenciosamente,',
      senderName: document.sender_name || document.signature1_name || '',
      senderTitle: document.sender_title || document.signature1_title || '',
    };

    // Generate HTML
    const html = generateDocumentHTML(templateData);

    // Generate PDF via Puppeteer + Chromium
    const pdfBuffer = await generatePDFFromHTML(html);

    // Create history entry
    await db.docManagementHistory.create({
      data: {
        document_id: id,
        user_id: userId,
        action: 'pdf_generated',
        description: 'PDF gerado para o documento (Puppeteer + Chromium)',
      },
    });

    await logAction(userId, 'generate_pdf_doc_management', `PDF gerado para documento ${document.number_formatted}`);

    const fileName = `${document.number_formatted || document.protocol}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar PDF';
    return NextResponse.json(
      { error: 'Erro ao gerar PDF', detail: errorMessage },
      { status: 500 }
    );
  }
});
