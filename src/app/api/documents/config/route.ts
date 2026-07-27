import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ─── Default config values ───
const DEFAULT_CONFIGS = [
  {
    config_key: 'prefeitura_name',
    config_value: 'Prefeitura Municipal',
    description: 'Nome da Prefeitura Municipal',
  },
  {
    config_key: 'nuca_name',
    config_value: 'NUCA — Núcleo de Cidadania de Adolescentes',
    description: 'Nome do NUCA',
  },
  {
    config_key: 'municipio',
    config_value: '',
    description: 'Nome do município',
  },
  {
    config_key: 'estado',
    config_value: '',
    description: 'Nome do estado',
  },
  {
    config_key: 'header_html',
    config_value: '<div style="text-align:center;"><strong>{{prefeitura_name}}</strong><br/>{{nuca_name}}</div>',
    description: 'HTML do cabeçalho dos documentos',
  },
  {
    config_key: 'footer_html',
    config_value: '<div style="text-align:center;font-size:9px;">Documento gerado pelo sistema NUCA — {{municipio}}</div>',
    description: 'HTML do rodapé dos documentos',
  },
  {
    config_key: 'brasao_url',
    config_value: '',
    description: 'URL do brasão (imagem) para o cabeçalho',
  },
  {
    config_key: 'logo_url',
    config_value: '/uploads/nuca-logo.png',
    description: 'URL do logo NUCA para documentos',
  },
];

// ─── GET: Get all config entries ───
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    // Check if any config entries exist
    const existingConfigs = await db.docManagementConfig.findMany();

    // If none exist, create defaults
    if (existingConfigs.length === 0) {
      for (const defaultConfig of DEFAULT_CONFIGS) {
        await db.docManagementConfig.create({
          data: defaultConfig,
        });
      }

      // Fetch the newly created configs
      const configs = await db.docManagementConfig.findMany();
      return NextResponse.json({ configs });
    }

    // Check if any default keys are missing and add them
    const existingKeys = existingConfigs.map(c => c.config_key);
    const missingKeys = DEFAULT_CONFIGS.filter(d => !existingKeys.includes(d.config_key));

    for (const missing of missingKeys) {
      await db.docManagementConfig.create({
        data: missing,
      });
    }

    // Fetch all configs (including newly added)
    const configs = await db.docManagementConfig.findMany();

    return NextResponse.json({ configs });
  } catch (error) {
    console.error('Error fetching config:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar configurações' },
      { status: 500 }
    );
  }
});

// ─── PUT: Update config entries ───
export const PUT = withRole(['Admin'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const userId = req.user!.userId;

    // Accept array of {config_key, config_value} pairs
    const entries: Array<{ config_key: string; config_value: string }> = body.entries || body;

    if (!Array.isArray(entries)) {
      return NextResponse.json(
        { error: 'Formato inválido. Envie um array de {config_key, config_value}' },
        { status: 400 }
      );
    }

    const updatedConfigs = [];

    for (const entry of entries) {
      if (!entry.config_key) continue;

      // Update or create the config entry
      const updated = await db.docManagementConfig.upsert({
        where: { config_key: entry.config_key },
        update: {
          config_value: entry.config_value || '',
          updated_by: userId,
        },
        create: {
          config_key: entry.config_key,
          config_value: entry.config_value || '',
          updated_by: userId,
        },
      });

      updatedConfigs.push(updated);
    }

    await logAction(userId, 'update_doc_config', `Configurações do módulo documental atualizadas (${entries.length} itens)`);

    return NextResponse.json({ configs: updatedConfigs });
  } catch (error) {
    console.error('Error updating config:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar configurações' },
      { status: 500 }
    );
  }
});
