import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { PDFDocument, PDFFont, PDFPage, rgb, Color } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─── Page constants (A4) ───
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_LEFT = 70;
const MARGIN_RIGHT = 70;
const MARGIN_TOP = 130;   // leave space for graphical header
const MARGIN_BOTTOM = 120; // leave space for graphical footer
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

// ─── Load template images ───
function loadTemplateImages() {
  const imgDir = path.join(process.cwd(), 'public', 'images', 'doc-templates');
  return {
    waveTop: fs.readFileSync(path.join(imgDir, 'wave-top.png')),
    waveBottom: fs.readFileSync(path.join(imgDir, 'wave-bottom.png')),
    logoNuca: fs.readFileSync(path.join(imgDir, 'logo-nuca.png')),
    watermark: fs.readFileSync(path.join(imgDir, 'watermark-unicef.png')),
    sealMunicipio: fs.readFileSync(path.join(imgDir, 'sele-unicef-municipio.png')),
    seal25Years: fs.readFileSync(path.join(imgDir, 'seal-unicef-25years.png')),
  };
}

// ─── HTML to plain text converter ───
function htmlToPlainText(html: string): string {
  if (!html) return '';
  let text = html;
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '• ');
  text = text.replace(/<\/ul>/gi, '\n');
  text = text.replace(/<\/ol>/gi, '\n');
  text = text.replace(/<ul[^>]*>/gi, '\n');
  text = text.replace(/<ol[^>]*>/gi, '\n');
  // Preserve bold markers before stripping tags
  text = text.replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**');
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.trim();
  text = text.replace(/\n{3,}/g, '\n\n');
  return text;
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

// ─── Draw text with word wrapping, bold support, and pagination ───
async function drawWrappedText(
  pdfDoc: PDFDocument,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  page: PDFPage,
  bottomMargin: number,
  images: ReturnType<typeof loadTemplateImages>,
  color: Color = rgb(0, 0, 0)
): Promise<{ y: number; page: PDFPage }> {
  let y = startY;
  let currentPage = page;

  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      y -= lineHeight * 0.5;
      if (y < bottomMargin) {
        currentPage = await addNewPage(pdfDoc, images);
        y = A4_HEIGHT - MARGIN_TOP;
      }
      continue;
    }

    // Parse **bold** segments within the paragraph
    const segments = paragraph.split(/(\*\*[^*]+\*\*)/g);
    const words: { text: string; bold: boolean }[] = [];
    for (const seg of segments) {
      if (seg.startsWith('**') && seg.endsWith('**')) {
        const inner = seg.slice(2, -2);
        for (const w of inner.split(' ')) {
          if (w) words.push({ text: w, bold: true });
        }
      } else {
        for (const w of seg.split(' ')) {
          if (w) words.push({ text: w, bold: false });
        }
      }
    }

    // Word wrap with mixed bold/regular
    let currentLine: { text: string; bold: boolean }[] = [];
    let currentLineText = '';

    for (const word of words) {
      const testLine = currentLineText ? `${currentLineText} ${word.text}` : word.text;
      const testFont = word.bold ? fontBold : fontRegular;
      const testWidth = testFont.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && currentLine.length > 0) {
        // Draw current line
        await drawLineWithBold(currentLine, currentPage, x, y, fontSize, fontRegular, fontBold, color);
        y -= lineHeight;
        if (y < bottomMargin) {
          currentPage = await addNewPage(pdfDoc, images);
          y = A4_HEIGHT - MARGIN_TOP;
        }
        currentLine = [word];
        currentLineText = word.text;
      } else {
        currentLine.push(word);
        currentLineText = testLine;
      }
    }

    if (currentLine.length > 0) {
      await drawLineWithBold(currentLine, currentPage, x, y, fontSize, fontRegular, fontBold, color);
      y -= lineHeight;
      if (y < bottomMargin) {
        currentPage = await addNewPage(pdfDoc, images);
        y = A4_HEIGHT - MARGIN_TOP;
      }
    }

    y -= lineHeight * 0.3;
  }

  return { y, page: currentPage };
}

// ─── Draw a single line with mixed bold/regular segments ───
async function drawLineWithBold(
  line: { text: string; bold: boolean }[],
  page: PDFPage,
  x: number,
  y: number,
  fontSize: number,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  color: Color
) {
  let currentX = x;
  for (const word of line) {
    const font = word.bold ? fontBold : fontRegular;
    const wordText = `${word.text} `;
    page.drawText(wordText, {
      x: currentX,
      y,
      size: fontSize,
      font,
      color,
    });
    currentX += font.widthOfTextAtSize(wordText, fontSize);
  }
}

// ─── Add a new page with header, footer, and watermark ───
async function addNewPage(
  pdfDoc: PDFDocument,
  images: ReturnType<typeof loadTemplateImages>
): Promise<PDFPage> {
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  await drawPageDecorations(page, pdfDoc, images);
  return page;
}

// ─── Draw graphical header, footer, and watermark on a page ───
async function drawPageDecorations(
  page: PDFPage,
  pdfDoc: PDFDocument,
  images: ReturnType<typeof loadTemplateImages>
) {
  // Embed images
  const waveTopImg = await pdfDoc.embedPng(images.waveTop);
  const waveBottomImg = await pdfDoc.embedPng(images.waveBottom);
  const logoImg = await pdfDoc.embedPng(images.logoNuca);
  const watermarkImg = await pdfDoc.embedPng(images.watermark);
  const sealMunicipioImg = await pdfDoc.embedPng(images.sealMunicipio);
  const seal25YearsImg = await pdfDoc.embedPng(images.seal25Years);

  // ─── Watermark (centered, semi-transparent) ───
  const wmScale = 0.45;
  const wmWidth = watermarkImg.width * wmScale;
  const wmHeight = watermarkImg.height * wmScale;
  page.drawImage(watermarkImg, {
    x: (A4_WIDTH - wmWidth) / 2,
    y: (A4_HEIGHT - wmHeight) / 2,
    width: wmWidth,
    height: wmHeight,
    opacity: 0.12,
  });

  // ─── Header: wave (top-left) + NUCA logo (top-right) ───
  const waveTopScale = 0.32;
  const waveTopWidth = waveTopImg.width * waveTopScale;
  const waveTopHeight = waveTopImg.height * waveTopScale;
  page.drawImage(waveTopImg, {
    x: 0,
    y: A4_HEIGHT - waveTopHeight,
    width: waveTopWidth,
    height: waveTopHeight,
  });

  const logoScale = 0.22;
  const logoWidth = logoImg.width * logoScale;
  const logoHeight = logoImg.height * logoScale;
  page.drawImage(logoImg, {
    x: A4_WIDTH - logoWidth - 20,
    y: A4_HEIGHT - logoHeight - 15,
    width: logoWidth,
    height: logoHeight,
  });

  // ─── Footer: UNICEF seals (left) + wave (bottom-right) ───
  const sealScale = 0.12;
  const sealMunWidth = sealMunicipioImg.width * sealScale;
  const sealMunHeight = sealMunicipioImg.height * sealScale;
  page.drawImage(sealMunicipioImg, {
    x: 25,
    y: 25,
    width: sealMunWidth,
    height: sealMunHeight,
  });

  const seal25Width = seal25YearsImg.width * sealScale;
  const seal25Height = seal25YearsImg.height * sealScale;
  page.drawImage(seal25YearsImg, {
    x: 25 + sealMunWidth + 8,
    y: 25,
    width: seal25Width,
    height: seal25Height,
  });

  const waveBottomScale = 0.32;
  const waveBottomWidth = waveBottomImg.width * waveBottomScale;
  const waveBottomHeight = waveBottomImg.height * waveBottomScale;
  page.drawImage(waveBottomImg, {
    x: A4_WIDTH - waveBottomWidth,
    y: 0,
    width: waveBottomWidth,
    height: waveBottomHeight,
  });
}

// ─── GET: Generate PDF for document (MODELO NOVO layout) ───
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

    // Fetch config for city/municipio defaults
    const configEntries = await db.docManagementConfig.findMany();
    const configMap: Record<string, string> = {};
    for (const entry of configEntries) {
      configMap[entry.config_key] = entry.config_value || '';
    }
    const defaultCity = configMap.municipio || 'Limoeiro de Anadia';
    const uf = configMap.uf || 'AL';

    // ─── Create PDF ───
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const fontFiles = loadFonts();
    const fontRegular = await pdfDoc.embedFont(fontFiles.regular);
    const fontBold = await pdfDoc.embedFont(fontFiles.bold);
    const fontItalic = await pdfDoc.embedFont(fontFiles.italic);

    const images = loadTemplateImages();

    // First page
    let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    await drawPageDecorations(page, pdfDoc, images);

    let y = A4_HEIGHT - MARGIN_TOP;

    // ─── Line 1: Document number (left) + City/Date (right) ───
    const docLabel = DOCUMENT_TYPE_LABELS[document.document_type] || 'Documento';
    const numText = document.number_formatted || `${docLabel} nº ${String(document.number).padStart(3, '0')}/${document.year}`;
    page.drawText(numText, {
      x: MARGIN_LEFT,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const cityName = document.city || defaultCity;
    const dateFormatted = formatDatePortuguese(new Date(document.date));
    const dateLocationText = `${cityName}/${uf}, ${dateFormatted}.`;
    const dateWidth = fontRegular.widthOfTextAtSize(dateLocationText, 11);
    page.drawText(dateLocationText, {
      x: A4_WIDTH - MARGIN_RIGHT - dateWidth,
      y,
      size: 11,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
    y -= 30;

    // ─── Recipient section ───
    page.drawText('À', {
      x: MARGIN_LEFT,
      y,
      size: 12,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
    y -= 20;

    // Treatment (e.g., "Excelentíssima Senhora,")
    if (document.recipient_treatment) {
      page.drawText(document.recipient_treatment, {
        x: MARGIN_LEFT,
        y,
        size: 12,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      y -= 18;
    }

    // Recipient name
    if (document.recipient) {
      page.drawText(document.recipient, {
        x: MARGIN_LEFT,
        y,
        size: 12,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      y -= 18;
    }

    // Recipient title
    if (document.recipient_title) {
      page.drawText(document.recipient_title, {
        x: MARGIN_LEFT,
        y,
        size: 12,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      y -= 18;
    }

    // Institution
    if (document.institution) {
      page.drawText(document.institution, {
        x: MARGIN_LEFT,
        y,
        size: 12,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      y -= 20;
    }

    y -= 10;

    // ─── Subject (bold) ───
    if (document.subject) {
      page.drawText('Assunto: ', {
        x: MARGIN_LEFT,
        y,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      const subjectLabelWidth = fontBold.widthOfTextAtSize('Assunto: ', 12);
      page.drawText(document.subject, {
        x: MARGIN_LEFT + subjectLabelWidth,
        y,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      y -= 30;
    }

    // ─── Vocative (e.g., "Prezada Secretária,") ───
    if (document.vocative) {
      page.drawText(document.vocative, {
        x: MARGIN_LEFT,
        y,
        size: 12,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      y -= 25;
    }

    // ─── Body text (justified, with bold support) ───
    const bodyPlainText = htmlToPlainText(document.body_text || '');
    if (bodyPlainText) {
      const result = await drawWrappedText(
        pdfDoc,
        fontRegular,
        fontBold,
        bodyPlainText,
        MARGIN_LEFT,
        y,
        CONTENT_WIDTH,
        12,
        18,
        page,
        MARGIN_BOTTOM + 80, // leave space for closing + signature
        images,
        rgb(0, 0, 0)
      );
      y = result.y;
      page = result.page;
    }

    y -= 30;

    // ─── Closing (e.g., "Atenciosamente,") ───
    const closingText = document.closing || 'Atenciosamente,';
    page.drawText(closingText, {
      x: MARGIN_LEFT,
      y,
      size: 12,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
    y -= 60; // space for signature

    // ─── Sender name (UPPERCASE, bold) + title ───
    const senderName = document.sender_name || document.signature1_name || '';
    const senderTitle = document.sender_title || document.signature1_title || '';

    if (senderName) {
      const senderNameUpper = senderName.toUpperCase();
      page.drawText(senderNameUpper, {
        x: MARGIN_LEFT,
        y,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      y -= 16;
    }

    if (senderTitle) {
      page.drawText(senderTitle, {
        x: MARGIN_LEFT,
        y,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      y -= 16;
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
    return NextResponse.json(
      { error: 'Erro ao gerar PDF' },
      { status: 500 }
    );
  }
});
