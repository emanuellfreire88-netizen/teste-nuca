import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─── A4 page dimensions ───
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

// ─── Margins (matching the original MODELO NOVO layout) ───
const MARGIN_LEFT = 60;   // ~10% from left
const MARGIN_RIGHT = 60;  // ~10% from right
const CONTENT_WIDTH = A4_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

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

// ─── Load embedded fonts (Liberation Sans = Times-like) ───
function loadFonts() {
  const fontsDir = path.join(process.cwd(), 'public', 'fonts');
  return {
    regular: fs.readFileSync(path.join(fontsDir, 'LiberationSans-Regular.ttf')),
    bold: fs.readFileSync(path.join(fontsDir, 'LiberationSans-Bold.ttf')),
    italic: fs.readFileSync(path.join(fontsDir, 'LiberationSans-Italic.ttf')),
  };
}

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

// ─── Convert HTML to plain text paragraphs ───
function htmlToParagraphs(html: string): string[] {
  if (!html) return [];
  let text = html;
  text = text.replace(/<strong[^>]*>/gi, '**').replace(/<\/strong>/gi, '**');
  text = text.replace(/<b[^>]*>/gi, '**').replace(/<\/b>/gi, '**');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '• ');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  return text.split('\n\n').map((p) => p.trim()).filter((p) => p.length > 0);
}

// ─── Draw text with word wrapping and bold support ───
function drawWrappedText(
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  page: PDFPage,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  bottomLimit: number,
  color = rgb(0, 0, 0)
): number {
  let y = startY;
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      y -= lineHeight * 0.5;
      continue;
    }

    // Parse **bold** markers
    const segments: { text: string; bold: boolean }[] = [];
    const parts = paragraph.split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2);
        for (const w of inner.split(' ')) {
          if (w) segments.push({ text: w, bold: true });
        }
      } else {
        for (const w of part.split(' ')) {
          if (w) segments.push({ text: w, bold: false });
        }
      }
    }

    // Word wrap
    let currentLine: { text: string; bold: boolean }[] = [];
    let currentLineText = '';

    for (const word of segments) {
      const testLine = currentLineText ? `${currentLineText} ${word.text}` : word.text;
      const testFont = word.bold ? fontBold : fontRegular;
      const testWidth = testFont.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && currentLine.length > 0) {
        // Draw current line
        let drawX = x;
        for (const w of currentLine) {
          const font = w.bold ? fontBold : fontRegular;
          const wordText = `${w.text} `;
          page.drawText(wordText, { x: drawX, y, size: fontSize, font, color });
          drawX += font.widthOfTextAtSize(wordText, fontSize);
        }
        y -= lineHeight;
        if (y < bottomLimit) return y;
        currentLine = [word];
        currentLineText = word.text;
      } else {
        currentLine.push(word);
        currentLineText = testLine;
      }
    }

    // Draw remaining line
    if (currentLine.length > 0) {
      let drawX = x;
      for (const w of currentLine) {
        const font = w.bold ? fontBold : fontRegular;
        const wordText = `${w.text} `;
        page.drawText(wordText, { x: drawX, y, size: fontSize, font, color });
        drawX += font.widthOfTextAtSize(wordText, fontSize);
      }
      y -= lineHeight;
    }
    y -= lineHeight * 0.3;
  }
  return y;
}

// ─── Cover a text line with a white rectangle ───
function coverText(
  page: PDFPage,
  x: number,
  yBottom: number,
  width: number,
  height: number
) {
  page.drawRectangle({
    x,
    y: yBottom,
    width,
    height,
    color: rgb(1, 1, 1), // white
    opacity: 1,
  });
}

// ─── GET: Generate PDF using MODELO NOVO.pdf as base template ───
export const GET = withAuth(async (req: AuthenticatedRequest, context?: { params: Promise<Record<string, string>> }) => {
  try {
    if (!context?.params) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    const { id } = await context.params;
    const userId = req.user!.userId;

    // Rate limit PDF generation (ETAPA 12 — prevent abuse)
    const rateLimitResult = applyRateLimit(req, 'pdf_gen', RATE_LIMITS.PDF_GENERATION);
    if (rateLimitResult) {
      return NextResponse.json(
        { error: rateLimitResult.body.error },
        { status: rateLimitResult.status, headers: { 'Retry-After': String(rateLimitResult.body.retryAfter) } }
      );
    }

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

    // Fetch config
    const configEntries = await db.docManagementConfig.findMany();
    const configMap: Record<string, string> = {};
    for (const entry of configEntries) {
      configMap[entry.config_key] = entry.config_value || '';
    }
    const defaultCity = document.city || configMap.municipio || 'Limoeiro de Anadia';
    const uf = configMap.uf || 'AL';

    // ─── Load the MODELO NOVO.pdf as base template ───
    const templatePath = path.join(process.cwd(), 'templates', 'pdf-templates', 'memorando-base.pdf');
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);

    // Register fontkit for custom fonts
    const fontkit = (await import('@pdf-lib/fontkit')).default;
    pdfDoc.registerFontkit(fontkit);

    // Embed fonts
    const fontFiles = loadFonts();
    const fontRegular = await pdfDoc.embedFont(fontFiles.regular);
    const fontBold = await pdfDoc.embedFont(fontFiles.bold);

    // Get the first (and only) page
    const pages = pdfDoc.getPages();
    const page = pages[0];

    const fontSize = 12;
    const lineHeight = 16;

    // ─── Step 1: Cover original text with white rectangles ───
    // The original PDF has text from ~Y=12% to ~Y=88% of the page.
    // We cover the entire text area (below header, above footer) to create
    // a clean slate while preserving the header graphics, watermark, and footer.
    // Y in pdf-lib is from bottom: Y_pdf = A4_HEIGHT - (Y_percent/100 * A4_HEIGHT)

    // Cover from Y=10% to Y=92% (text area), full width minus margins
    const coverTop = A4_HEIGHT - (0.08 * A4_HEIGHT);    // 8% from top
    const coverBottom = 0.10 * A4_HEIGHT;                 // 10% from bottom
    const coverHeight = coverTop - coverBottom;

    coverText(page, MARGIN_LEFT - 10, coverBottom, CONTENT_WIDTH + 20, coverHeight);

    // ─── Redraw the watermark on top of the white cover ───
    // The watermark was covered by the white rectangle. Redraw it at low
    // opacity so it appears behind the text (matching the original template).
    try {
      const watermarkPath = path.join(process.cwd(), 'public', 'images', 'doc-templates', 'watermark-unicef.png');
      const watermarkBytes = fs.readFileSync(watermarkPath);
      const watermarkImg = await pdfDoc.embedPng(watermarkBytes);
      const wmScale = 0.14; // scale to fit nicely in the center
      const wmWidth = watermarkImg.width * wmScale;
      const wmHeight = watermarkImg.height * wmScale;
      page.drawImage(watermarkImg, {
        x: (A4_WIDTH - wmWidth) / 2,
        y: (A4_HEIGHT - wmHeight) / 2 - 30,
        width: wmWidth,
        height: wmHeight,
        opacity: 0.10,
      });
    } catch {
      // Watermark is optional — continue without it if image not found
    }

    // ─── Step 2: Draw the new dynamic text ───

    // Line 1: Document number (left) + date/location (right)
    const docLabel = DOCUMENT_TYPE_LABELS[document.document_type] || 'Documento';
    const numText = document.number_formatted || `${docLabel} nº ${String(document.number).padStart(3, '0')}/${document.year}`;
    let y = A4_HEIGHT - (0.12 * A4_HEIGHT); // Y=12% from top

    page.drawText(numText, {
      x: MARGIN_LEFT,
      y,
      size: fontSize,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    const dateStr = formatDatePortuguese(new Date(document.date));
    const dateLocation = `${defaultCity}/${uf}, ${dateStr}.`;
    const dateWidth = fontRegular.widthOfTextAtSize(dateLocation, fontSize);
    page.drawText(dateLocation, {
      x: A4_WIDTH - MARGIN_RIGHT - dateWidth,
      y,
      size: fontSize,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight * 2.5; // space after number/date

    // Recipient section
    page.drawText('À', {
      x: MARGIN_LEFT,
      y,
      size: fontSize,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;

    if (document.recipient_treatment) {
      page.drawText(document.recipient_treatment, { x: MARGIN_LEFT, y, size: fontSize, font: fontRegular, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }
    if (document.recipient) {
      page.drawText(document.recipient, { x: MARGIN_LEFT, y, size: fontSize, font: fontRegular, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }
    if (document.recipient_title) {
      page.drawText(document.recipient_title, { x: MARGIN_LEFT, y, size: fontSize, font: fontRegular, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }
    if (document.institution) {
      page.drawText(document.institution, { x: MARGIN_LEFT, y, size: fontSize, font: fontRegular, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }

    y -= lineHeight * 0.8; // extra space

    // Subject (bold)
    if (document.subject) {
      page.drawText('Assunto: ', { x: MARGIN_LEFT, y, size: fontSize, font: fontRegular, color: rgb(0, 0, 0) });
      const labelWidth = fontRegular.widthOfTextAtSize('Assunto: ', fontSize);
      page.drawText(document.subject, { x: MARGIN_LEFT + labelWidth, y, size: fontSize, font: fontBold, color: rgb(0, 0, 0) });
      y -= lineHeight * 1.8;
    }

    // Vocative
    if (document.vocative) {
      page.drawText(document.vocative, { x: MARGIN_LEFT, y, size: fontSize, font: fontRegular, color: rgb(0, 0, 0) });
      y -= lineHeight * 1.5;
    }

    // Body text
    const bodyParagraphs = htmlToParagraphs(document.body_text || '');
    const bodyText = bodyParagraphs.join('\n\n');
    if (bodyText) {
      const bottomLimit = A4_HEIGHT * 0.22; // stop before closing/signature
      y = drawWrappedText(
        bodyText,
        MARGIN_LEFT,
        y,
        CONTENT_WIDTH,
        fontSize,
        lineHeight,
        page,
        fontRegular,
        fontBold,
        bottomLimit
      );
    }

    // Closing
    y -= lineHeight;
    const closingText = document.closing || 'Atenciosamente,';
    page.drawText(closingText, { x: MARGIN_LEFT, y, size: fontSize, font: fontRegular, color: rgb(0, 0, 0) });
    y -= lineHeight * 3.5; // space for signature

    // Sender name (UPPERCASE, bold)
    const senderName = document.sender_name || document.signature1_name || '';
    const senderTitle = document.sender_title || document.signature1_title || '';

    if (senderName) {
      page.drawText(senderName.toUpperCase(), { x: MARGIN_LEFT, y, size: fontSize, font: fontBold, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }
    if (senderTitle) {
      page.drawText(senderTitle, { x: MARGIN_LEFT, y, size: fontSize, font: fontBold, color: rgb(0, 0, 0) });
    }

    // ─── Save PDF ───
    const pdfBytes = await pdfDoc.save();

    // Create history entry
    await db.docManagementHistory.create({
      data: {
        document_id: id,
        user_id: userId,
        action: 'pdf_generated',
        description: 'PDF gerado usando MODELO NOVO.pdf como template base',
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
  } catch (error) {
    console.error('Error generating PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar PDF';
    return NextResponse.json(
      { error: 'Erro ao gerar PDF', detail: errorMessage },
      { status: 500 }
    );
  }
});
