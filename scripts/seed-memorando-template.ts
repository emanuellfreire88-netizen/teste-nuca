// Seed script: creates the MODELO NOVO memorando as a template in the database
// Run with: bun run scripts/seed-memorando-template.ts

import { db } from '@/lib/db';

async function main() {
  console.log('📝 Criando template do MODELO NOVO...');

  const templateData = {
    name: 'memorando_padrao_nuca',
    display_name: 'Memorando Padrão NUCA',
    document_type: 'memorando',
    description: 'Modelo padrão de memorando do NUCA — baseado no MODELO NOVO',
    body_text: `<p>Cumprimentando cordialmente Vossa Senhoria, vimos por meio deste solicitar a disponibilização de <strong>[OBJETO DA SOLICITAÇÃO]</strong> para <strong>[QUANTIDADE] ([QUANTIDADE POR EXTENSO]) pessoas</strong>, destinado aos participantes de uma ação do <strong>Selo UNICEF</strong>, que será realizada no dia <strong>[DATA DO EVENTO]</strong>, por volta das <strong>[HORÁRIO]</strong>, no <strong>[LOCAL]</strong>.</p>

<p>A solicitação tem como objetivo garantir melhores condições para o desenvolvimento das atividades, contribuindo para o acolhimento e a participação dos envolvidos durante a ação.</p>

<p>Certos de contarmos com o apoio dessa Secretaria, antecipamos nossos agradecimentos e colocamo-nos à disposição para quaisquer esclarecimentos.</p>`,
    signature1_name: 'JEFERSON SILVA SOUZA',
    signature1_title: 'Mobilizador do Nuca',
    is_default: true,
    is_active: true,
  };

  // Upsert: cria se não existir, atualiza se já existir
  const template = await db.docManagementTemplate.upsert({
    where: { name: templateData.name },
    update: {
      display_name: templateData.display_name,
      document_type: templateData.document_type,
      description: templateData.description,
      body_text: templateData.body_text,
      signature1_name: templateData.signature1_name,
      signature1_title: templateData.signature1_title,
      is_default: templateData.is_default,
      is_active: templateData.is_active,
    },
    create: templateData,
  });

  console.log(`✅ Template criado/atualizado: ${template.display_name} (id: ${template.id})`);

  // Também cria um template de Solicitação de Alimentação (baseado no memorando de almoço)
  const solicitacaoData = {
    name: 'solicitacao_alimentacao_nuca',
    display_name: 'Solicitação de Alimentação NUCA',
    document_type: 'solicitacao_alimentacao',
    description: 'Modelo para solicitação de lanche/almoço para ações do NUCA',
    body_text: `<p>Venho por meio deste solicitar a disponibilização de <strong>[TIPO DE ALIMENTAÇÃO]</strong> para <strong>[QUANTIDADE] ([QUANTIDADE POR EXTENSO]) pessoas</strong>, no dia <strong>[DATA]</strong>, após a realização da ação do <strong>NUCA (Núcleo de Cidadania dos Adolescentes)</strong>. A referida atividade possui extrema importância para o fortalecimento das ações voltadas ao <strong>Selo UNICEF</strong>, contribuindo diretamente para o engajamento dos adolescentes e para o cumprimento dos compromissos assumidos pelo município.</p>

<p>Contamos com a compreensão e apoio dessa Secretaria, reconhecendo a relevância da ação para o desenvolvimento das políticas públicas voltadas à criança e ao adolescente.</p>`,
    signature1_name: 'JEFERSON SILVA SOUZA',
    signature1_title: 'Mobilizador do Nuca',
    is_default: false,
    is_active: true,
  };

  const template2 = await db.docManagementTemplate.upsert({
    where: { name: solicitacaoData.name },
    update: {
      display_name: solicitacaoData.display_name,
      document_type: solicitacaoData.document_type,
      description: solicitacaoData.description,
      body_text: solicitacaoData.body_text,
      signature1_name: solicitacaoData.signature1_name,
      signature1_title: solicitacaoData.signature1_title,
    },
    create: solicitacaoData,
  });

  console.log(`✅ Template criado/atualizado: ${template2.display_name} (id: ${template2.id})`);

  console.log('\n🎉 Templates cadastrados com sucesso!');
  console.log('   Agora ao criar um novo Memorando, basta selecionar o modelo "Memorando Padrão NUCA"');
  console.log('   e o texto será preenchido automaticamente.');

  await db.$disconnect();
}

main().catch((e) => {
  console.error('❌ Erro:', e);
  process.exit(1);
});
