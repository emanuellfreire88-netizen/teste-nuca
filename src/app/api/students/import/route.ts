import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { sanitizeInput } from '@/lib/auth';
import { logAction } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ─── Column header mapping (flexible, PT-BR + EN, case-insensitive) ──────────
// Each canonical field maps to a list of accepted header aliases.
const FIELD_ALIASES: Record<string, string[]> = {
  full_name: [
    'nome_completo', 'nome completo', 'nome', 'full_name', 'fullname',
    'aluno', 'nome do aluno', 'student name', 'name',
  ],
  cpf: ['cpf', 'cpf/cnpj'],
  rg: ['rg', 'identidade', 'registro_geral'],
  date_of_birth: [
    'data_nascimento', 'data de nascimento', 'nascimento',
    'data_de_nascimento', 'date_of_birth', 'birthdate', 'birth date',
    'dnascimento', 'dtnasc',
  ],
  blood_type: ['tipo_sanguineo', 'tipo sanguineo', 'sangue', 'blood_type', 'blood type'],
  special_needs: [
    'necessidades_especiais', 'necessidades especiais', 'necessidades',
    'special_needs', 'special needs',
  ],
  medications: ['medicamentos', 'medication', 'medicacao', 'medicação'],
  class: ['turma', 'class', 'classe'],
  grade: ['serie', 'série', 'grade', 'ano', 'ano_escolar'],
  phone: ['telefone', 'phone', 'celular', 'tel', 'whatsapp'],
  address: ['endereco', 'endereço', 'address', 'logradouro', 'rua'],
  guardian_name: [
    'responsavel', 'responsável', 'responsavel_nome', 'nome do responsavel',
    'nome_responsavel', 'guardian_name', 'parent name', 'mae', 'pai',
  ],
  guardian_phone: [
    'responsavel_telefone', 'telefone do responsavel', 'telefone_responsavel',
    'guardian_phone', 'parent phone', 'contato_responsavel',
  ],
  guardian_email: [
    'responsavel_email', 'email do responsavel', 'email_responsavel',
    'guardian_email', 'parent email',
  ],
  emergency_contact: [
    'emergencia', 'contato_emergencia', 'contato de emergencia',
    'emergency_contact', 'emergency contact',
  ],
  school_name: [
    'escola', 'nome_escola', 'nome da escola', 'school', 'school_name',
    'unidade',
  ],
};

const REQUIRED_FIELDS = ['full_name'] as const;

interface ParsedRow {
  rowIndex: number; // 1-based, including header
  raw: Record<string, unknown>;
  mapped: Record<string, string>;
  errors: string[];
}

interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: { row: number; name: string; reason: string }[];
}

/**
 * Builds a lookup from header -> canonical field name.
 * Header matching is case-insensitive and trims whitespace.
 */
function buildHeaderMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers) {
    const normalized = String(header || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!normalized) continue;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(normalized)) {
        map[normalized] = field;
        break;
      }
    }
  }
  return map;
}

function cleanValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) {
    s = v.toISOString().slice(0, 10);
  } else if (typeof v === 'number') {
    s = String(v);
  } else {
    s = String(v);
  }
  return s.trim();
}

/** Normalizes a CPF to 11 digits. Returns null if empty, 'INVALID' if bad length. */
function normalizeCpf(cpf: string): string | null {
  const clean = cpf.replace(/[^0-9]/g, '');
  if (clean.length === 0) return null;
  if (clean.length !== 11) return 'INVALID';
  return clean;
}

export const POST = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const defaultSchoolId = cleanValue(formData.get('school_id'));

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Nenhum arquivo enviado.' },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: 'O arquivo enviado está vazio.' },
        { status: 400 }
      );
    }

    // 5 MB hard limit
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'O arquivo excede o tamanho máximo de 5 MB.' },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv') || file.type === 'text/csv';
    const isXlsx =
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (!isCsv && !isXlsx) {
      return NextResponse.json(
        { error: 'Formato não suportado. Envie um arquivo .csv ou .xlsx.' },
        { status: 400 }
      );
    }

    // ── Read file into workbook ──
    // For CSV files, decode as UTF-8 string so accented characters are
    // preserved (xlsx defaults to latin-1 for CSV buffers, which mangles
    // Portuguese characters like ã, é, ç). XLSX files are binary and use
    // the buffer path.
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = isCsv
      ? XLSX.read(buffer.toString('utf-8'), {
          type: 'string',
          cellDates: true,
          raw: false,
          codepage: 65001,
        })
      : XLSX.read(buffer, {
          type: 'buffer',
          cellDates: true,
          raw: false,
        });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { error: 'A planilha não contém abas.' },
        { status: 400 }
      );
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'A planilha não contém linhas de dados.' },
        { status: 400 }
      );
    }

    // Cap to a safe maximum
    if (rows.length > 1000) {
      return NextResponse.json(
        { error: 'A planilha contém mais de 1000 linhas. Divida o arquivo e tente novamente.' },
        { status: 400 }
      );
    }

    // Build header map from the first row keys
    const headers = Object.keys(rows[0]);
    const headerMap = buildHeaderMap(headers);

    // Verify required columns exist
    const missingRequired = REQUIRED_FIELDS.filter(
      (f) => !Object.values(headerMap).includes(f)
    );
    if (missingRequired.length > 0) {
      return NextResponse.json(
        {
          error: `Colunas obrigatórias ausentes: ${missingRequired.join(', ')}. Verifique se a planilha possui a coluna "nome" (ou equivalente).`,
        },
        { status: 400 }
      );
    }

    // Validate default school (if provided)
    let defaultSchoolValid = false;
    if (defaultSchoolId) {
      const school = await db.school.findUnique({ where: { id: defaultSchoolId } });
      if (!school) {
        return NextResponse.json(
          { error: 'Escola padrão informada não foi encontrada.' },
          { status: 400 }
        );
      }
      defaultSchoolValid = true;
    }

    // ── Pre-load all schools for name resolution ──
    const allSchools = await db.school.findMany({
      select: { id: true, name: true },
    });
    const schoolByName = new Map<string, string>();
    for (const s of allSchools) {
      schoolByName.set(s.name.trim().toLowerCase(), s.id);
    }

    // ── Pre-load existing CPFs to avoid N+1 queries ──
    const allCpfsInRows = new Set<string>();
    const parsed: ParsedRow[] = [];
    rows.forEach((raw, idx) => {
      const mapped: Record<string, string> = {};
      for (const [header, value] of Object.entries(raw)) {
        const normalized = String(header).trim().toLowerCase().replace(/\s+/g, ' ');
        const field = headerMap[normalized];
        if (field && !mapped[field]) {
          mapped[field] = cleanValue(value);
        }
      }
      const errors: string[] = [];

      if (!mapped.full_name) {
        errors.push('Nome é obrigatório');
      } else if (mapped.full_name.length > 255) {
        errors.push('Nome excede 255 caracteres');
      }

      if (mapped.cpf) {
        const norm = normalizeCpf(mapped.cpf);
        if (norm === 'INVALID') {
          errors.push('CPF deve conter 11 dígitos');
        } else if (norm) {
          mapped.cpf = norm;
          allCpfsInRows.add(norm);
        } else {
          mapped.cpf = '';
        }
      }

      // Validate date_of_birth (accept YYYY-MM-DD or DD/MM/YYYY)
      if (mapped.date_of_birth) {
        const d = mapped.date_of_birth;
        let parsedDate: Date | null = null;
        if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
          parsedDate = new Date(d);
        } else if (/^\d{2}\/\d{2}\/\d{4}/.test(d)) {
          const [dd, mm, yyyy] = d.split(/[\/\-]/);
          parsedDate = new Date(`${yyyy}-${mm}-${dd}`);
        } else if (!isNaN(Date.parse(d))) {
          parsedDate = new Date(d);
        }
        if (parsedDate && !isNaN(parsedDate.getTime())) {
          mapped.date_of_birth = parsedDate.toISOString().slice(0, 10);
        } else if (d) {
          errors.push('Data de nascimento inválida');
        }
      }

      // Determine school: row-level school_name overrides default
      let resolvedSchoolId = defaultSchoolValid ? defaultSchoolId : '';
      if (mapped.school_name) {
        const found = schoolByName.get(mapped.school_name.trim().toLowerCase());
        if (found) {
          resolvedSchoolId = found;
        } else {
          errors.push(`Escola "${mapped.school_name}" não encontrada`);
        }
      }
      if (!resolvedSchoolId) {
        errors.push('Escola não definida (defina uma escola padrão ou use a coluna "escola")');
      }
      mapped._school_id = resolvedSchoolId;

      parsed.push({
        rowIndex: idx + 2, // +2: 1-based, and header is row 1
        raw,
        mapped,
        errors,
      });
    });

    // Look up existing CPFs in DB
    const existingCpfSet = new Set<string>();
    if (allCpfsInRows.size > 0) {
      const existing = await db.student.findMany({
        where: { cpf: { in: Array.from(allCpfsInRows) } },
        select: { cpf: true },
      });
      for (const s of existing) {
        if (s.cpf) existingCpfSet.add(s.cpf);
      }
    }

    // ── Process rows: separate valid from invalid, dedupe in-file CPFs ──
    const result: ImportResult = {
      total: parsed.length,
      created: 0,
      skipped: 0,
      errors: [],
    };

    const seenCpfsInBatch = new Set<string>();
    const toCreate: Array<Record<string, unknown>> = [];

    for (const p of parsed) {
      const name = p.mapped.full_name || '(sem nome)';

      if (p.errors.length > 0) {
        result.errors.push({ row: p.rowIndex, name, reason: p.errors.join('; ') });
        continue;
      }

      // Skip duplicate CPF (already in DB or already in this batch)
      if (p.mapped.cpf) {
        if (existingCpfSet.has(p.mapped.cpf)) {
          result.skipped++;
          result.errors.push({
            row: p.rowIndex,
            name,
            reason: 'CPF já cadastrado',
          });
          continue;
        }
        if (seenCpfsInBatch.has(p.mapped.cpf)) {
          result.skipped++;
          result.errors.push({
            row: p.rowIndex,
            name,
            reason: 'CPF duplicado dentro do arquivo',
          });
          continue;
        }
        seenCpfsInBatch.add(p.mapped.cpf);
      }

      toCreate.push({
        full_name: sanitizeInput(p.mapped.full_name),
        cpf: p.mapped.cpf || null,
        rg: p.mapped.rg ? sanitizeInput(p.mapped.rg) : null,
        date_of_birth: p.mapped.date_of_birth ? new Date(p.mapped.date_of_birth) : null,
        blood_type: p.mapped.blood_type ? sanitizeInput(p.mapped.blood_type) : null,
        special_needs: p.mapped.special_needs ? sanitizeInput(p.mapped.special_needs) : null,
        medications: p.mapped.medications ? sanitizeInput(p.mapped.medications) : null,
        class: p.mapped.class ? sanitizeInput(p.mapped.class) : null,
        grade: p.mapped.grade ? sanitizeInput(p.mapped.grade) : null,
        phone: p.mapped.phone ? sanitizeInput(p.mapped.phone) : null,
        address: p.mapped.address ? sanitizeInput(p.mapped.address) : null,
        guardian_name: p.mapped.guardian_name ? sanitizeInput(p.mapped.guardian_name) : null,
        guardian_phone: p.mapped.guardian_phone ? sanitizeInput(p.mapped.guardian_phone) : null,
        guardian_email: p.mapped.guardian_email ? sanitizeInput(p.mapped.guardian_email) : null,
        emergency_contact: p.mapped.emergency_contact ? sanitizeInput(p.mapped.emergency_contact) : null,
        school_id: p.mapped._school_id,
        status: 'active',
      });
    }

    // ── Bulk insert (sequential, since Neon HTTP adapter does not support $transaction) ──
    if (toCreate.length > 0) {
      let created = 0;
      for (const data of toCreate) {
        try {
          await db.student.create({ data });
          created++;
        } catch {
          result.skipped++;
          result.errors.push({
            row: 0,
            name: String(data.full_name),
            reason: 'Erro ao criar aluno (possível CPF duplicado ou dados inválidos)',
          });
        }
      }
      result.created = created;
    }

    await logAction(
      req.user!.userId,
      'create_student',
      `Importação em lote: ${result.created} criados, ${result.skipped} ignorados, ${result.errors.length - result.skipped} com erro de ${result.total} linhas`,
      req
    );

    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    console.error('Import students error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor ao importar alunos.' },
      { status: 500 }
    );
  }
});
