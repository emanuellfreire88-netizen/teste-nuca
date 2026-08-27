/**
 * HTML template generator for document PDF.
 * Reproduces the MODELO NOVO layout using the extracted template images.
 * The HTML is rendered to PDF by Puppeteer (headless Chromium).
 */

import fs from 'fs';
import path from 'path';

// Load template images as base64 data URIs
function loadImageAsBase64(filename: string): string {
  const imgPath = path.join(process.cwd(), 'public', 'images', 'doc-templates', filename);
  const buffer = fs.readFileSync(imgPath);
  const ext = path.extname(filename).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export interface DocumentTemplateData {
  documentTypeLabel: string;
  number: number;
  year: number;
  city: string;
  uf: string;
  dateStr: string;
  treatment: string;
  recipient: string;
  recipientTitle: string;
  institution: string;
  subject: string;
  vocative: string;
  bodyParagraphs: string[];
  closing: string;
  senderName: string;
  senderTitle: string;
}

/**
 * Converts plain text with **bold** markers to HTML with <strong> tags.
 */
function processBoldText(text: string): string {
  // Escape HTML special characters first
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Convert **text** to <strong>text</strong>
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return escaped;
}

/**
 * Generates the full HTML document that reproduces the MODELO NOVO layout.
 * This HTML is rendered by Puppeteer to produce a pixel-perfect PDF.
 */
export function generateDocumentHTML(data: DocumentTemplateData): string {
  const waveTop = loadImageAsBase64('wave-top.png');
  const waveBottom = loadImageAsBase64('wave-bottom.png');
  const logoNuca = loadImageAsBase64('logo-nuca.png');
  const watermark = loadImageAsBase64('watermark-unicef.png');
  const sealMunicipio = loadImageAsBase64('sele-unicef-municipio.png');
  const seal25Years = loadImageAsBase64('seal-unicef-25years.png');

  const titleText = `${data.documentTypeLabel} n.º ${String(data.number).padStart(3, '0')} /${data.year} – NUCA`;
  const dateLocation = `${data.city}/${data.uf}, ${data.dateStr}.`;

  // Build body paragraphs HTML
  const bodyHTML = data.bodyParagraphs
    .map((p) => `<p class="body-text">${processBoldText(p)}</p>`)
    .join('\n');

  // Build recipient section
  const recipientLines: string[] = [];
  recipientLines.push('<div class="recipient-block">');
  recipientLines.push('<p class="recipient-line">À</p>');
  if (data.treatment) {
    recipientLines.push(`<p class="recipient-line">${escapeHtml(data.treatment)}</p>`);
  }
  if (data.recipient) {
    recipientLines.push(`<p class="recipient-line">${escapeHtml(data.recipient)}</p>`);
  }
  if (data.recipientTitle) {
    recipientLines.push(`<p class="recipient-line">${escapeHtml(data.recipientTitle)}</p>`);
  }
  if (data.institution) {
    recipientLines.push(`<p class="recipient-line">${escapeHtml(data.institution)}</p>`);
  }
  recipientLines.push('</div>');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4;
    margin: 0;
  }
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    font-family: "Times New Roman", "Liberation Serif", serif;
    font-size: 12pt;
    color: #000;
    position: relative;
    width: 210mm;
    height: 297mm;
    overflow: hidden;
  }

  /* ─── Watermark (centered, semi-transparent) ─── */
  .watermark {
    position: absolute;
    top: 45%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 120mm;
    height: 120mm;
    opacity: 0.10;
    z-index: 0;
    pointer-events: none;
    object-fit: contain;
  }

  /* ─── Header: wave (top-left) + NUCA logo (top-right) ─── */
  .header-wave {
    position: absolute;
    top: 0;
    left: 0;
    width: 75mm;
    height: auto;
    z-index: 2;
  }

  .header-logo {
    position: absolute;
    top: 6mm;
    right: 10mm;
    height: 22mm;
    width: auto;
    z-index: 3;
  }

  /* ─── Footer: UNICEF seals (bottom-left) + wave (bottom-right) ─── */
  .footer-seals {
    position: absolute;
    bottom: 6mm;
    left: 10mm;
    display: flex;
    gap: 4mm;
    align-items: center;
    z-index: 3;
  }

  .footer-seal {
    height: 16mm;
    width: auto;
  }

  .footer-wave {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 75mm;
    height: auto;
    z-index: 2;
  }

  /* ─── Content area ─── */
  .content {
    position: relative;
    z-index: 1;
    padding: 40mm 20mm 45mm 20mm;
  }

  /* ─── Document number + date line ─── */
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8mm;
  }

  .doc-number {
    font-size: 12pt;
    font-weight: normal;
  }

  .doc-date {
    font-size: 12pt;
    text-align: right;
  }

  /* ─── Recipient section ─── */
  .recipient-block {
    margin-bottom: 6mm;
  }

  .recipient-line {
    font-size: 12pt;
    line-height: 1.5;
  }

  /* ─── Subject ─── */
  .subject-line {
    font-size: 12pt;
    margin-bottom: 6mm;
  }

  .subject-label {
    font-weight: normal;
  }

  .subject-text {
    font-weight: bold;
  }

  /* ─── Vocative ─── */
  .vocative {
    font-size: 12pt;
    margin-bottom: 5mm;
  }

  /* ─── Body text ─── */
  .body-text {
    font-size: 12pt;
    line-height: 1.5;
    text-align: justify;
    text-indent: 12mm;
    margin-bottom: 5mm;
  }

  /* ─── Closing ─── */
  .closing {
    font-size: 12pt;
    margin-top: 8mm;
    margin-bottom: 20mm;
  }

  /* ─── Sender signature ─── */
  .sender-block {
    text-align: left;
    padding-left: 60mm;
  }

  .sender-name {
    font-size: 12pt;
    font-weight: bold;
    text-transform: uppercase;
    margin-bottom: 2mm;
  }

  .sender-title {
    font-size: 12pt;
    font-weight: bold;
  }
</style>
</head>
<body>
  <!-- Watermark -->
  <img class="watermark" src="${watermark}" alt="" />

  <!-- Header -->
  <img class="header-wave" src="${waveTop}" alt="" />
  <img class="header-logo" src="${logoNuca}" alt="NUCA" />

  <!-- Footer -->
  <div class="footer-seals">
    <img class="footer-seal" src="${sealMunicipio}" alt="" />
    <img class="footer-seal" src="${seal25Years}" alt="" />
  </div>
  <img class="footer-wave" src="${waveBottom}" alt="" />

  <!-- Content -->
  <div class="content">
    <!-- Document number + date -->
    <div class="doc-header">
      <span class="doc-number">${escapeHtml(titleText)}</span>
      <span class="doc-date">${escapeHtml(dateLocation)}</span>
    </div>

    <!-- Recipient -->
    ${recipientLines.join('\n')}

    <!-- Subject -->
    <p class="subject-line">
      <span class="subject-label">Assunto: </span>
      <span class="subject-text">${escapeHtml(data.subject)}</span>
    </p>

    <!-- Vocative -->
    <p class="vocative">${escapeHtml(data.vocative)}</p>

    <!-- Body -->
    ${bodyHTML}

    <!-- Closing -->
    <p class="closing">${escapeHtml(data.closing)}</p>

    <!-- Sender -->
    <div class="sender-block">
      <p class="sender-name">${escapeHtml(data.senderName)}</p>
      <p class="sender-title">${escapeHtml(data.senderTitle)}</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
