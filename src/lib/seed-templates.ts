import { db } from '@/lib/db';

export async function seedDefaultTemplates() {
  // Check if authorization_exit template already exists
  const existing = await db.documentTemplate.findUnique({
    where: { name: 'authorization_exit' },
  });

  if (existing) {
    // Update existing template with new text
    return db.documentTemplate.update({
      where: { id: existing.id },
      data: {
        display_name: 'Termo de Autorização',
        description: 'Modelo padrão de termo de autorização para atividades do NUCA',
        header_text: 'TERMO DE AUTORIZAÇÃO',
        body_text: 'NUCA – Núcleo de Cidadania de Adolescentes',
        footer_text: 'Documento gerado automaticamente pelo sistema NUCA — Núcleo de Cidadania de Adolescentes',
        declaration: 'Eu, identificado(a) acima como responsável legal pelo(a) adolescente, autorizo sua participação na atividade descrita neste documento, promovida pelo NUCA – Núcleo de Cidadania de Adolescentes. Declaro estar ciente da programação, do local, dos horários de saída e retorno, bem como das orientações repassadas pela coordenação do NUCA. Autorizo, ainda, que, em caso de necessidade, sejam adotadas as medidas cabíveis para atendimento médico de urgência ou emergência, sendo o responsável legal comunicado o mais breve possível. Declaro que as informações prestadas neste documento são verdadeiras e assumo inteira responsabilidade por esta autorização.',
      },
    });
  }

  return db.documentTemplate.create({
    data: {
      name: 'authorization_exit',
      display_name: 'Termo de Autorização',
      description: 'Modelo padrão de termo de autorização para atividades do NUCA',
      header_text: 'TERMO DE AUTORIZAÇÃO',
      body_text: 'NUCA – Núcleo de Cidadania de Adolescentes',
      footer_text: 'Documento gerado automaticamente pelo sistema NUCA — Núcleo de Cidadania de Adolescentes',
      declaration: 'Eu, identificado(a) acima como responsável legal pelo(a) adolescente, autorizo sua participação na atividade descrita neste documento, promovida pelo NUCA – Núcleo de Cidadania de Adolescentes. Declaro estar ciente da programação, do local, dos horários de saída e retorno, bem como das orientações repassadas pela coordenação do NUCA. Autorizo, ainda, que, em caso de necessidade, sejam adotadas as medidas cabíveis para atendimento médico de urgência ou emergência, sendo o responsável legal comunicado o mais breve possível. Declaro que as informações prestadas neste documento são verdadeiras e assumo inteira responsabilidade por esta autorização.',
      is_active: true,
    },
  });
}
