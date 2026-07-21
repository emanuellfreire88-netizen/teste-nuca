import { db } from '@/lib/db';

export async function seedDefaultTemplates() {
  // Check if authorization_exit template already exists
  const existing = await db.documentTemplate.findUnique({
    where: { name: 'authorization_exit' },
  });

  if (existing) return existing;

  return db.documentTemplate.create({
    data: {
      name: 'authorization_exit',
      display_name: 'Autorização de Saída para Passeio',
      description: 'Modelo padrão de autorização de saída para passeios e atividades escolares',
      header_text: 'AUTORIZAÇÃO DE SAÍDA',
      body_text: 'Núcleo de Cidadania de Adolescentes',
      footer_text: 'Documento gerado automaticamente pelo sistema NUCA — Núcleo de Cidadania de Adolescentes',
      declaration: 'Declaro estar ciente das informações acima e autorizo a participação do(a) aluno(a) na atividade descrita.',
      is_active: true,
    },
  });
}
