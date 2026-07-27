import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─── Constants ───
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_LEFT = 60;
const MARGIN_RIGHT = 60;
const MARGIN_TOP = 80;
const MARGIN_BOTTOM = 60;
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

// ─── Load font files ───
function loadFonts() {
  const fontsDir = path.join(process.cwd(), 'public', 'fonts');
  return {
    regular: fs.readFileSync(path.join(fontsDir, 'LiberationSans-Regular.ttf')),
    bold: fs.readFileSync(path.join(fontsDir, 'LiberationSans-Bold.ttf')),
    italic: fs.readFileSync(path.join(fontsDir, 'LiberationSans-Italic.ttf')),
  };
}

// ─── HTML to plain text converter ───
function htmlToPlainText(html: string): string {
  if (!html) return '';

  let text = html;

  // Handle paragraph breaks
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');

  // Handle line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Handle lists
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '• ');
  text = text.replace(/<\/ul>/gi, '\n');
  text = text.replace(/<\/ol>/gi, '\n');
  text = text.replace(/<ul[^>]*>/gi, '\n');
  text = text.replace(/<ol[^>]*>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Clean up whitespace
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');

  // Trim and normalize line breaks
  text = text.trim();
  text = text.replace(/\n{3,}/g, '\n\n');

  return text;
}

// ─── Format date in Portuguese ───
function formatDatePortuguese(date: Date): string {
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} de ${month} de ${year}`;
}

// ─── Draw text with word wrapping and pagination ───
async function drawWrappedText(
  pdfDoc: PDFDocument,
  font: PDFFont,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  page: PDFPage,
  bottomMargin: number,
  color: { red: number; green: number; blue: number } = rgb(0, 0, 0)
): Promise<{ y: number; page: PDFPage }> {
  let y = startY;
  let currentPage = page;

  // Split text into paragraphs
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      y -= lineHeight * 0.5;
      if (y < bottomMargin) {
        currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        y = A4_HEIGHT - MARGIN_TOP;
        // Draw footer on new page
        drawPageFooter(pdfDoc, currentPage, font);
      }
      continue;
    }

    // Word wrap the paragraph
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && currentLine) {
        // Draw current line
        currentPage.drawText(currentLine, { x, y, size: fontSize, font, color });
        y -= lineHeight;

        // Check if we need a new page
        if (y < bottomMargin) {
          currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
          y = A4_HEIGHT - MARGIN_TOP;
          drawPageFooter(pdfDoc, currentPage, font);
        }

        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    // Draw remaining line
    if (currentLine) {
      currentPage.drawText(currentLine, { x, y, size: fontSize, font, color });
      y -= lineHeight;

      if (y < bottomMargin) {
        currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        y = A4_HEIGHT - MARGIN_TOP;
        drawPageFooter(pdfDoc, currentPage, font);
      }
    }

    // Paragraph spacing
    y -= lineHeight * 0.3;
  }

  return { y, page: currentPage };
}

// ─── Draw page footer ───
function drawPageFooter(
  pdfDoc: PDFDocument,
  page: PDFPage,
  font: PDFFont
) {
  const totalPages = pdfDoc.getPageCount();
  const currentPageIndex = pdfDoc.getPages().indexOf(page);
  const pageNum = currentPageIndex + 1;

  // Page number centered at bottom
  const pageText = `Página ${pageNum} de ${totalPages}`;
  const textWidth = font.widthOfTextAtSize(pageText, 9);
  page.drawText(pageText, {
    x: (A4_WIDTH - textWidth) / 2,
    y: 30,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
}

// ─── Draw signature block ───
function drawSignatureBlock(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  name: string,
  title: string
) {
  if (!name) return y;

  // Draw line
  page.drawLine({
    start: { x, y },
    end: { x: x + 180, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });

  // Draw name below the line
  page.drawText(name, {
    x: x + 10,
    y: y - 15,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });

  // Draw title below name
  if (title) {
    page.drawText(title, {
      x: x + 10,
      y: y - 28,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  return y - 45;
}

// ─── GET: Generate PDF for document ───
export const GET = withAuth(async (req: AuthenticatedRequest, context: { params: Promise<Record<string, string>> }) => {
  try {
    const { id } = await context.params;
    const userId = req.user!.userId;

    // Fetch document
    const document = await db.docManagementDocument.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, full_name: true },
        },
        template: {
          select: { id: true, name: true, display_name: true },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Documento não encontrado' },
        { status: 404 }
      );
    }

    // Fetch config
    const configEntries = await db.docManagementConfig.findMany();
    const configMap: Record<string, string> = {};
    for (const entry of configEntries) {
      configMap[entry.config_key] = entry.config_value || '';
    }

    const prefeituraName = configMap.prefeitura_name || 'Prefeitura Municipal';
    const nucaName = configMap.nuca_name || 'NUCA — Núcleo de Cidadania de Adolescentes';
    const municipio = configMap.municipio || '';

    // ─── Create PDF ───
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // Embed fonts
    const fontFiles = loadFonts();
    const fontRegular = await pdfDoc.embedFont(fontFiles.regular);
    const fontBold = await pdfDoc.embedFont(fontFiles.bold);
    const fontItalic = await pdfDoc.embedFont(fontFiles.italic);

    // First page
    let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    let y = A4_HEIGHT - MARGIN_TOP;

    // ─── Header ───
    // Prefeitura name
    const headerText1 = prefeituraName;
    const headerWidth1 = fontBold.widthOfTextAtSize(headerText1, 14);
    page.drawText(headerText1, {
      x: (A4_WIDTH - headerWidth1) / 2,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 22;

    // NUCA name
    const headerText2 = nucaName;
    const headerWidth2 = fontRegular.widthOfTextAtSize(headerText2, 11);
    page.drawText(headerText2, {
      x: (A4_WIDTH - headerWidth2) / 2,
      y,
      size: 11,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 35;

    // Separator line
    page.drawLine({
      start: { x: MARGIN_LEFT, y },
      end: { x: A4_WIDTH - MARGIN_RIGHT, y },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    y -= 25;

    // ─── Document title ───
    const docTitle = document.number_formatted || `${DOCUMENT_TYPE_LABELS[document.document_type]} nº ${String(document.number).padStart(3, '0')}/${document.year}`;
    const titleWidth = fontBold.widthOfTextAtSize(docTitle, 16);
    page.drawText(docTitle, {
      x: (A4_WIDTH - titleWidth) / 2,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 30;

    // ─── Protocol and date ───
    const protocolText = `Protocolo: ${document.protocol}`;
    page.drawText(protocolText, {
      x: MARGIN_LEFT,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });

    const dateFormatted = formatDatePortuguese(new Date(document.date));
    const dateText = `Data: ${dateFormatted}`;
    const dateWidth = fontRegular.widthOfTextAtSize(dateText, 10);
    page.drawText(dateText, {
      x: A4_WIDTH - MARGIN_RIGHT - dateWidth,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 30;

    // ─── Recipient section ───
    if (document.recipient) {
      page.drawText('Destinatário:', {
        x: MARGIN_LEFT,
        y,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      y -= 16;

      page.drawText(document.recipient, {
        x: MARGIN_LEFT + 10,
        y,
        size: 11,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      y -= 16;

      if (document.recipient_title) {
        page.drawText(document.recipient_title, {
          x: MARGIN_LEFT + 10,
          y,
          size: 10,
          font: fontItalic,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= 16;
      }

      if (document.institution) {
        page.drawText(document.institution, {
          x: MARGIN_LEFT + 10,
          y,
          size: 10,
          font: fontItalic,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= 20;
      }
    }

    // ─── Subject ───
    if (document.subject) {
      page.drawText('Assunto:', {
        x: MARGIN_LEFT,
        y,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      const subjectText = document.subject;
      const subjectWidth = fontBold.widthOfTextAtSize('Assunto: ', 11);
      page.drawText(subjectText, {
        x: MARGIN_LEFT + subjectWidth,
        y,
        size: 11,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      y -= 25;
    }

    // Separator line before body
    page.drawLine({
      start: { x: MARGIN_LEFT, y },
      end: { x: A4_WIDTH - MARGIN_RIGHT, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 20;

    // ─── Body text ───
    const bodyPlainText = htmlToPlainText(document.body_text || '');

    if (bodyPlainText) {
      const result = await drawWrappedText(
        pdfDoc,
        fontRegular,
        bodyPlainText,
        MARGIN_LEFT,
        y,
        CONTENT_WIDTH,
        11,
        16,
        page,
        MARGIN_BOTTOM + 60, // Leave space for signatures
        rgb(0, 0, 0)
      );
      y = result.y;
      page = result.page;
    }

    // ─── Signatures section ───
    y -= 40;

    // Check if we have enough space for signatures
    const signatureHeight = 150; // Approximate height needed for 3 signatures
    if (y - signatureHeight < MARGIN_BOTTOM) {
      page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      y = A4_HEIGHT - MARGIN_TOP;
      drawPageFooter(pdfDoc, page, fontRegular);
    }

    // Signature columns
    const sig1X = MARGIN_LEFT;
    const sig2X = A4_WIDTH / 2 - 90;
    const sig3X = A4_WIDTH - MARGIN_RIGHT - 180;

    if (document.signature1_name) {
      drawSignatureBlock(page, fontRegular, sig1X, y, document.signature1_name, document.signature1_title || '');
    }
    if (document.signature2_name) {
      drawSignatureBlock(page, fontRegular, sig2X, y, document.signature2_name, document.signature2_title || '');
    }
    if (document.signature3_name) {
      drawSignatureBlock(page, fontRegular, sig3X, y, document.signature3_name, document.signature3_title || '');
    }

    // ─── Update all page footers with correct total page count ───
    const totalPages = pdfDoc.getPageCount();
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      // Clear the footer area and redraw
      const pageNumText = `Página ${i + 1} de ${totalPages}`;
      const pageNumWidth = fontRegular.widthOfTextAtSize(pageNumText, 9);

      // Draw footer text
      p.drawText(pageNumText, {
        x: (A4_WIDTH - pageNumWidth) / 2,
        y: 30,
        size: 9,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4),
      });

      // Draw municipio/NUCA footer line
      if (municipio) {
        const footerLine = `${nucaName} — ${municipio}`;
        const footerLineWidth = fontRegular.widthOfTextAtSize(footerLine, 8);
        p.drawText(footerLine, {
          x: (A4_WIDTH - footerLineWidth) / 2,
          y: 18,
          size: 8,
          font: fontRegular,
          color: rgb(0.5, 0.5, 0.5),
        });
      }
    }

    // ─── Save PDF ───
    const pdfBytes = await pdfDoc.save();

    // ─── Create history entry ───
    await db.docManagementHistory.create({
      data: {
        document_id: id,
        user_id: userId,
        action: 'pdf_generated',
        description: 'PDF gerado para o documento',
      },
    });

    await logAction(userId, 'generate_pdf_doc_management', `PDF gerado para documento ${document.number_formatted}`);

    // ─── Return PDF as binary response ───
    const fileName = `${document.number_formatted || document.protocol}.pdf`;

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(pdfBytes.length),
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar PDF' },
      { status: 500 }
    );
  }
});
