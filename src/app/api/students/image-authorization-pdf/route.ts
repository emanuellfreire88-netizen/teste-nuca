import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// ── Brand colors ──────────────────────────────────────────────────────────
const BLUE_DARK  = rgb(0 / 255, 85 / 255, 150 / 255);
const DARK_TEXT  = rgb(33 / 255, 37 / 255, 41 / 255);
const BLUE_TEXT  = rgb(0 / 255, 85 / 255, 150 / 255);
const LIGHT_GRAY = rgb(108 / 255, 117 / 255, 125 / 255);
const ORANGE     = rgb(247 / 255, 148 / 255, 29 / 255);
const BORDER     = rgb(160 / 255, 170 / 255, 180 / 255);

/**
 * POST /api/students/image-authorization-pdf
 *
 * Generates an "AUTORIZAÇÃO PARA USO DE IMAGEM E VOZ" PDF for one or more students.
 * Uses the NUCA institutional template PDF as background.
 * Requires Admin or Operator role.
 */
export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const {
      student_ids,
      municipality,
    } = body as {
      student_ids: string[];
      municipality?: string;
    };

    // ── Validation ──
    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return NextResponse.json(
        { error: 'Informe ao menos um aluno' },
        { status: 400 }
      );
    }

    // ── Fetch students ──
    const students = await db.student.findMany({
      where: { id: { in: student_ids }, status: 'active' },
      select: {
        id: true, full_name: true,
        cpf: true, rg: true,
        guardian_name: true, guardian_phone: true,
        school: { select: { name: true, address: true } },
      },
      orderBy: { full_name: 'asc' },
    });

    if (students.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum aluno ativo encontrado' },
        { status: 404 }
      );
    }

    // ── Resolve municipality ──
    let resolvedMunicipality = municipality || '';
    if (!resolvedMunicipality && students[0]?.school?.address) {
      const addr = students[0].school.address;
      const parts = addr.split(/[-,]/);
      if (parts.length > 1) {
        resolvedMunicipality = parts[parts.length - 2].trim();
      }
    }

    // ── Today's date for signature ──
    const today = new Date();
    const todayDisplay = today.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

    // ══════════════════════════════════════════════════════════════════════════
    // BUILD THE PDF — Using NUCA template as base
    // ══════════════════════════════════════════════════════════════════════════

    const templatePath = join(process.cwd(), 'public', 'templates', 'authorization-template.pdf');
    const templateBytes = readFileSync(templatePath);
    const templateDoc = await PDFDocument.load(templateBytes);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // ── Embed LiberationSans fonts ──
    const fontsDir = join(process.cwd(), 'public', 'fonts');
    const fontRegular = await pdfDoc.embedFont(
      readFileSync(join(fontsDir, 'LiberationSans-Regular.ttf'))
    );
    const fontBold = await pdfDoc.embedFont(
      readFileSync(join(fontsDir, 'LiberationSans-Bold.ttf'))
    );
    const fontItalic = await pdfDoc.embedFont(
      readFileSync(join(fontsDir, 'LiberationSans-Italic.ttf'))
    );
    const fontBoldItalic = await pdfDoc.embedFont(
      readFileSync(join(fontsDir, 'LiberationSans-BoldItalic.ttf'))
    );

    // ── Helper: Draw text ──
    const drawText = (
      page: any,
      text: string,
      x: number,
      y: number,
      options: {
        font?: any;
        size?: number;
        color?: any;
        maxWidth?: number;
        align?: 'left' | 'center' | 'right';
      } = {}
    ) => {
      const f = options.font || fontRegular;
      const s = options.size || 10;
      const c = options.color || DARK_TEXT;
      let drawX = x;

      if (options.align === 'center' && options.maxWidth) {
        const textWidth = f.widthOfTextAtSize(text, s);
        drawX = x + (options.maxWidth - textWidth) / 2;
      } else if (options.align === 'right' && options.maxWidth) {
        const textWidth = f.widthOfTextAtSize(text, s);
        drawX = x + options.maxWidth - textWidth;
      }

      page.drawText(text, { x: drawX, y, size: s, font: f, color: c });
    };

    // ── Helper: Draw a labeled field with value and underline ──
    const drawField = (
      page: any,
      label: string,
      value: string,
      x: number,
      y: number,
      fieldWidth: number,
      labelWidth: number = 100
    ) => {
      drawText(page, label, x, y, {
        font: fontBold,
        size: 9,
        color: BLUE_TEXT,
      });

      const valueX = x + labelWidth + 4;
      const valueMaxW = fieldWidth - labelWidth - 8;
      let val = value;

      while (val.length > 0 && fontRegular.widthOfTextAtSize(val, 9) > valueMaxW) {
        val = val.slice(0, -1);
      }
      if (val !== value) val += '...';

      drawText(page, val, valueX, y, {
        font: fontRegular,
        size: 9,
        color: DARK_TEXT,
      });

      page.drawLine({
        start: { x: valueX, y: y - 3 },
        end: { x: x + fieldWidth, y: y - 3 },
        thickness: 0.5,
        color: BORDER,
      });
    };

    // ── Helper: Draw a blank fill-in field ──
    const drawBlankField = (
      page: any,
      label: string,
      value: string | null | undefined,
      x: number,
      y: number,
      fieldWidth: number,
      labelWidth: number = 50
    ) => {
      drawText(page, label, x, y, {
        font: fontBold,
        size: 9,
        color: BLUE_TEXT,
      });

      const valueX = x + labelWidth + 4;

      if (value) {
        let val = value;
        const valueMaxW = fieldWidth - labelWidth - 8;
        while (val.length > 0 && fontRegular.widthOfTextAtSize(val, 9) > valueMaxW) {
          val = val.slice(0, -1);
        }
        if (val !== value) val += '...';

        drawText(page, val, valueX, y, {
          font: fontRegular,
          size: 9,
          color: DARK_TEXT,
        });
      }

      page.drawLine({
        start: { x: valueX, y: y - 3 },
        end: { x: x + fieldWidth, y: y - 3 },
        thickness: 0.5,
        color: BORDER,
      });
    };

    // ── Helper: Draw a section header ──
    const drawSection = (
      page: any,
      title: string,
      x: number,
      y: number,
      width: number,
      accentColor: any = ORANGE
    ): number => {
      page.drawRectangle({
        x,
        y: y - 4,
        width: 4,
        height: 14,
        color: accentColor,
      });

      drawText(page, title, x + 10, y, {
        font: fontBold,
        size: 11,
        color: BLUE_DARK,
      });

      page.drawLine({
        start: { x, y: y - 8 },
        end: { x: x + width, y: y - 8 },
        thickness: 0.5,
        color: BORDER,
      });

      return y - 18;
    };

    // ── Helper: Draw multi-line wrapped text ──
    const drawWrappedText = (
      page: any,
      text: string,
      x: number,
      y: number,
      maxWidth: number,
      options: {
        font?: any;
        size?: number;
        color?: any;
        lineHeight?: number;
      } = {}
    ): number => {
      const f = options.font || fontRegular;
      const s = options.size || 9;
      const c = options.color || DARK_TEXT;
      const lh = options.lineHeight || 14;

      const words = text.split(' ');
      let line = '';
      let currentY = y;

      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const testWidth = f.widthOfTextAtSize(testLine, s);

        if (testWidth > maxWidth && line) {
          page.drawText(line, { x, y: currentY, size: s, font: f, color: c });
          currentY -= lh;
          line = word;
        } else {
          line = testLine;
        }
      }

      if (line) {
        page.drawText(line, { x, y: currentY, size: s, font: f, color: c });
        currentY -= lh;
      }

      return currentY;
    };

    // ── Helper: Draw bullet point ──
    const drawBullet = (
      page: any,
      text: string,
      x: number,
      y: number,
      maxWidth: number,
      options: {
        font?: any;
        size?: number;
        color?: any;
        lineHeight?: number;
      } = {}
    ): number => {
      const f = options.font || fontRegular;
      const s = options.size || 9;
      const c = options.color || DARK_TEXT;
      const lh = options.lineHeight || 13;

      // Draw bullet character
      drawText(page, '•', x, y, { font: fontBold, size: s, color: BLUE_TEXT });

      const bulletX = x + 12;
      const bulletMaxW = maxWidth - 12;

      const words = text.split(' ');
      let line = '';
      let currentY = y;

      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const testWidth = f.widthOfTextAtSize(testLine, s);

        if (testWidth > bulletMaxW && line) {
          page.drawText(line, { x: bulletX, y: currentY, size: s, font: f, color: c });
          currentY -= lh;
          line = word;
        } else {
          line = testLine;
        }
      }

      if (line) {
        page.drawText(line, { x: bulletX, y: currentY, size: s, font: f, color: c });
        currentY -= lh;
      }

      return currentY;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // Generate pages — one student per page
    // ══════════════════════════════════════════════════════════════════════════

    const MARGIN_LEFT = 42;
    const MARGIN_RIGHT = 42;
    const CONTENT_WIDTH = 595.5 - MARGIN_LEFT - MARGIN_RIGHT;

    for (const student of students) {
      // Copy the template page
      const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
      pdfDoc.addPage(templatePage);
      const page = pdfDoc.getPage(pdfDoc.getPageCount() - 1);

      const { height } = page.getSize();
      let y = height - 90;

      // ── Title ──
      drawText(page, 'AUTORIZAÇÃO PARA USO DE IMAGEM E VOZ', MARGIN_LEFT, y, {
        font: fontBold,
        size: 16,
        color: BLUE_DARK,
        maxWidth: CONTENT_WIDTH,
        align: 'center',
      });

      y -= 14;

      drawText(page, 'NUCA – Núcleo de Cidadania de Adolescentes', MARGIN_LEFT, y, {
        font: fontRegular,
        size: 9,
        color: LIGHT_GRAY,
        maxWidth: CONTENT_WIDTH,
        align: 'center',
      });

      // Separator
      y -= 10;
      page.drawLine({
        start: { x: MARGIN_LEFT, y },
        end: { x: MARGIN_LEFT + CONTENT_WIDTH, y },
        thickness: 0.8,
        color: BORDER,
      });
      y -= 18;

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 1: DADOS DO(A) ADOLESCENTE
      // ════════════════════════════════════════════════════════════════════════
      y = drawSection(page, 'DADOS DO(A) ADOLESCENTE', MARGIN_LEFT, y, CONTENT_WIDTH, BLUE_DARK);

      drawField(page, 'Nome:', student.full_name, MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 42);
      y -= 22;

      drawField(page, 'Escola:', student.school.name, MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 42);
      y -= 28;

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 2: DADOS DO RESPONSÁVEL LEGAL
      // ════════════════════════════════════════════════════════════════════════
      y = drawSection(page, 'DADOS DO RESPONSÁVEL LEGAL', MARGIN_LEFT, y, CONTENT_WIDTH, BLUE_DARK);

      drawBlankField(page, 'Nome:', student.guardian_name, MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 42);
      y -= 22;

      const halfW = (CONTENT_WIDTH - 16) / 2;

      drawBlankField(page, 'CPF:', student.cpf, MARGIN_LEFT + 8, y, halfW - 10, 30);
      drawBlankField(page, 'RG:', student.rg, MARGIN_LEFT + 8 + halfW, y, halfW, 24);
      y -= 22;

      drawBlankField(page, 'Telefone:', student.guardian_phone, MARGIN_LEFT + 8, y, CONTENT_WIDTH - 16, 52);
      y -= 28;

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 3: TERMO DE AUTORIZAÇÃO
      // ════════════════════════════════════════════════════════════════════════
      y = drawSection(page, 'TERMO DE AUTORIZAÇÃO', MARGIN_LEFT, y, CONTENT_WIDTH, ORANGE);

      const termX = MARGIN_LEFT + 8;
      const termMaxW = CONTENT_WIDTH - 16;

      // Paragraph 1: Main authorization declaration
      const para1 = `Eu, identificado(a) acima como responsável legal pelo(a) adolescente ${student.full_name}, autorizo o NUCA – Núcleo de Cidadania de Adolescentes, bem como a Prefeitura Municipal e os órgãos parceiros envolvidos nas ações do programa, a utilizar gratuitamente sua imagem, voz e nome em fotografias, vídeos, gravações e demais registros audiovisuais produzidos durante atividades, eventos, campanhas, projetos, oficinas, reuniões, viagens e demais ações institucionais.`;

      y = drawWrappedText(page, para1, termX, y, termMaxW, { size: 9, lineHeight: 13 });
      y -= 4;

      // Paragraph 2: Purpose of authorization
      const para2 = 'A presente autorização destina-se exclusivamente à divulgação das atividades do NUCA, podendo o material ser utilizado em:';

      y = drawWrappedText(page, para2, termX, y, termMaxW, { size: 9, lineHeight: 13 });
      y -= 2;

      // Bullet list of media channels
      const bulletItems = [
        'Site oficial da Prefeitura;',
        'Redes sociais oficiais;',
        'Materiais educativos e informativos;',
        'Cartilhas, folders, banners e informativos;',
        'Apresentações institucionais;',
        'Relatórios de prestação de contas;',
        'Campanhas educativas;',
        'Demais meios de comunicação institucionais, impressos ou digitais.',
      ];

      for (const item of bulletItems) {
        y = drawBullet(page, item, termX + 6, y, termMaxW - 6, { size: 9, lineHeight: 13 });
        y -= 1;
      }

      y -= 4;

      // Paragraph 3: Awareness declarations
      drawText(page, 'Declaro estar ciente de que:', termX, y, {
        font: fontBold,
        size: 9,
        color: BLUE_DARK,
      });
      y -= 14;

      const awarenessItems = [
        'A utilização da imagem e da voz ocorrerá exclusivamente para fins institucionais, educativos e informativos;',
        'Não haverá qualquer pagamento ou compensação financeira pela utilização da imagem;',
        'A presente autorização é concedida de forma gratuita e por prazo indeterminado, podendo ser revogada a qualquer momento mediante solicitação formal por escrito, sem efeitos retroativos sobre materiais já publicados.',
      ];

      for (const item of awarenessItems) {
        y = drawBullet(page, item, termX + 6, y, termMaxW - 6, { size: 9, lineHeight: 13 });
        y -= 1;
      }

      y -= 4;

      // Paragraph 4: Final declaration
      const para4 = 'Declaro ainda que li, compreendi e concordo com todos os termos desta autorização.';
      y = drawWrappedText(page, para4, termX, y, termMaxW, { font: fontBold, size: 9, lineHeight: 13 });
      y -= 20;

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 4: ASSINATURA
      // ════════════════════════════════════════════════════════════════════════
      y = drawSection(page, 'ASSINATURA', MARGIN_LEFT, y, CONTENT_WIDTH, BLUE_DARK);

      drawBlankField(page, 'Município:', resolvedMunicipality || null, MARGIN_LEFT + 8, y, halfW - 10, 60);
      drawBlankField(page, 'Data:', todayDisplay, MARGIN_LEFT + 8 + halfW, y, halfW, 35);
      y -= 30;

      // Signature line
      const sigW = 250;
      const sigCenterX = MARGIN_LEFT + CONTENT_WIDTH / 2;

      page.drawLine({
        start: { x: sigCenterX - sigW / 2, y: y - 6 },
        end: { x: sigCenterX + sigW / 2, y: y - 6 },
        thickness: 0.5,
        color: DARK_TEXT,
      });

      drawText(page, 'Assinatura do Responsável Legal', MARGIN_LEFT, y - 18, {
        font: fontRegular,
        size: 8,
        color: LIGHT_GRAY,
        maxWidth: CONTENT_WIDTH,
        align: 'center',
      });
      y -= 30;

      // ── Page number ──
      const idx = students.indexOf(student);
      drawText(page, `Página ${idx + 1} de ${students.length}`, MARGIN_LEFT, 50, {
        font: fontRegular,
        size: 7,
        color: DARK_TEXT,
        maxWidth: CONTENT_WIDTH,
        align: 'center',
      });

      // ── Auto-fill note at bottom ──
      drawText(page, 'Campos preenchidos automaticamente pelo sistema NUCA', MARGIN_LEFT, 40, {
        font: fontItalic,
        size: 6,
        color: LIGHT_GRAY,
        maxWidth: CONTENT_WIDTH,
        align: 'center',
      });
    }

    // ── Audit log ──
    await logAction(
      req.user!.userId,
      'export_report',
      `Geração de Autorização de Imagem e Voz (PDF): alunos=${students.length}`,
      req
    );

    // ── Return PDF ──
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="autorizacao-imagem-voz.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Image Authorization PDF error:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar autorização de imagem e voz' },
      { status: 500 }
    );
  }
});
