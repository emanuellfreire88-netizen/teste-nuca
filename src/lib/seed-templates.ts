import { db } from '@/lib/db';

export async function seedDefaultTemplates() {
  // ── Template 1: authorization_exit (Termo de Autorização) ──
  const existingAuth = await db.documentTemplate.findUnique({
    where: { name: 'authorization_exit' },
  });

  if (existingAuth) {
    await db.documentTemplate.update({
      where: { id: existingAuth.id },
      data: {
        display_name: 'Termo de Autorização',
        description: 'Modelo padrão de termo de autorização para atividades do NUCA',
        header_text: 'TERMO DE AUTORIZAÇÃO',
        body_text: 'NUCA – Núcleo de Cidadania de Adolescentes',
        footer_text: 'Documento gerado automaticamente pelo sistema NUCA — Núcleo de Cidadania de Adolescentes',
        declaration: 'Eu, identificado(a) acima como responsável legal pelo(a) adolescente, autorizo sua participação na atividade descrita neste documento, promovida pelo NUCA – Núcleo de Cidadania de Adolescentes. Declaro estar ciente da programação, do local, dos horários de saída e retorno, bem como das orientações repassadas pela coordenação do NUCA. Autorizo, ainda, que, em caso de necessidade, sejam adotadas as medidas cabíveis para atendimento médico de urgência ou emergência, sendo o responsável legal comunicado o mais breve possível. Declaro que as informações prestadas neste documento são verdadeiras e assumo inteira responsabilidade por esta autorização.',
      },
    });
  } else {
    await db.documentTemplate.create({
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

  // ── Template 2: authorization_image_voice (Autorização para Uso de Imagem e Voz) ──
  const existingImage = await db.documentTemplate.findUnique({
    where: { name: 'authorization_image_voice' },
  });

  if (existingImage) {
    await db.documentTemplate.update({
      where: { id: existingImage.id },
      data: {
        display_name: 'Autorização para Uso de Imagem e Voz',
        description: 'Autorização para uso de imagem, voz e nome do adolescente em registros audiovisuais do NUCA',
        header_text: 'AUTORIZAÇÃO PARA USO DE IMAGEM E VOZ',
        body_text: 'NUCA – Núcleo de Cidadania de Adolescentes',
        footer_text: 'Documento gerado automaticamente pelo sistema NUCA — Núcleo de Cidadania de Adolescentes',
        declaration: 'Eu, identificado(a) acima como responsável legal pelo(a) adolescente {{nome_adolescente}}, autorizo o NUCA – Núcleo de Cidadania de Adolescentes, bem como a Prefeitura Municipal e os órgãos parceiros envolvidos nas ações do programa, a utilizar gratuitamente sua imagem, voz e nome em fotografias, vídeos, gravações e demais registros audiovisuais produzidos durante atividades, eventos, campanhas, projetos, oficinas, reuniões, viagens e demais ações institucionais. A presente autorização destina-se exclusivamente à divulgação das atividades do NUCA, podendo o material ser utilizado em: Site oficial da Prefeitura; Redes sociais oficiais; Materiais educativos e informativos; Cartilhas, folders, banners e informativos; Apresentações institucionais; Relatórios de prestação de contas; Campanhas educativas; Demais meios de comunicação institucionais, impressos ou digitais. Declaro estar ciente de que: A utilização da imagem e da voz ocorrerá exclusivamente para fins institucionais, educativos e informativos; Não haverá qualquer pagamento ou compensação financeira pela utilização da imagem; A presente autorização é concedida de forma gratuita e por prazo indeterminado, podendo ser revogada a qualquer momento mediante solicitação formal por escrito, sem efeitos retroativos sobre materiais já publicados. Declaro ainda que li, compreendi e concordo com todos os termos desta autorização.',
      },
    });
  } else {
    await db.documentTemplate.create({
      data: {
        name: 'authorization_image_voice',
        display_name: 'Autorização para Uso de Imagem e Voz',
        description: 'Autorização para uso de imagem, voz e nome do adolescente em registros audiovisuais do NUCA',
        header_text: 'AUTORIZAÇÃO PARA USO DE IMAGEM E VOZ',
        body_text: 'NUCA – Núcleo de Cidadania de Adolescentes',
        footer_text: 'Documento gerado automaticamente pelo sistema NUCA — Núcleo de Cidadania de Adolescentes',
        declaration: 'Eu, identificado(a) acima como responsável legal pelo(a) adolescente {{nome_adolescente}}, autorizo o NUCA – Núcleo de Cidadania de Adolescentes, bem como a Prefeitura Municipal e os órgãos parceiros envolvidos nas ações do programa, a utilizar gratuitamente sua imagem, voz e nome em fotografias, vídeos, gravações e demais registros audiovisuais produzidos durante atividades, eventos, campanhas, projetos, oficinas, reuniões, viagens e demais ações institucionais. A presente autorização destina-se exclusivamente à divulgação das atividades do NUCA, podendo o material ser utilizado em: Site oficial da Prefeitura; Redes sociais oficiais; Materiais educativos e informativos; Cartilhas, folders, banners e informativos; Apresentações institucionais; Relatórios de prestação de contas; Campanhas educativas; Demais meios de comunicação institucionais, impressos ou digitais. Declaro estar ciente de que: A utilização da imagem e da voz ocorrerá exclusivamente para fins institucionais, educativos e informativos; Não haverá qualquer pagamento ou compensação financeira pela utilização da imagem; A presente autorização é concedida de forma gratuita e por prazo indeterminado, podendo ser revogada a qualquer momento mediante solicitação formal por escrito, sem efeitos retroativos sobre materiais já publicados. Declaro ainda que li, compreendi e concordo com todos os termos desta autorização.',
        is_active: true,
      },
    });
  }

  // ── Template 3: authorization_participation (Autorização de Participação) ──
  const existingParticipation = await db.documentTemplate.findUnique({
    where: { name: 'authorization_participation' },
  });

  const participationDeclaration = 'Eu, identificado(a) acima como responsável legal pelo(a) adolescente {{nome_adolescente}}, autorizo sua participação nas atividades promovidas pelo NUCA – Núcleo de Cidadania de Adolescentes, reconhecendo a importância das ações voltadas ao desenvolvimento da cidadania, participação social, formação pessoal e fortalecimento dos direitos de crianças e adolescentes. Declaro estar ciente de que as atividades poderão compreender encontros, oficinas, palestras, capacitações, campanhas, eventos, visitas técnicas, ações comunitárias, atividades culturais, esportivas e educativas, realizadas nas dependências do município ou em outros locais previamente informados pela coordenação do NUCA. Comprometo-me a comunicar à coordenação qualquer informação relevante que possa interferir na participação do(a) adolescente, bem como manter meus dados de contato atualizados. Declaro ainda que estou ciente das normas de participação do programa e autorizo o(a) adolescente acima identificado(a) a participar das atividades desenvolvidas pelo NUCA durante o período em que permanecer regularmente inscrito(a) no programa. Declaro que li, compreendi e concordo com os termos desta autorização, assumindo inteira responsabilidade pelas informações prestadas.';

  if (existingParticipation) {
    await db.documentTemplate.update({
      where: { id: existingParticipation.id },
      data: {
        display_name: 'Autorização de Participação',
        description: 'Autorização para participação do adolescente nas atividades do NUCA',
        header_text: 'AUTORIZAÇÃO DE PARTICIPAÇÃO',
        body_text: 'NUCA – Núcleo de Cidadania de Adolescentes',
        footer_text: 'Documento gerado automaticamente pelo sistema NUCA — Núcleo de Cidadania de Adolescentes',
        declaration: participationDeclaration,
      },
    });
  } else {
    await db.documentTemplate.create({
      data: {
        name: 'authorization_participation',
        display_name: 'Autorização de Participação',
        description: 'Autorização para participação do adolescente nas atividades do NUCA',
        header_text: 'AUTORIZAÇÃO DE PARTICIPAÇÃO',
        body_text: 'NUCA – Núcleo de Cidadania de Adolescentes',
        footer_text: 'Documento gerado automaticamente pelo sistema NUCA — Núcleo de Cidadania de Adolescentes',
        declaration: participationDeclaration,
        is_active: true,
      },
    });
  }

  return { authorization_exit: 'ok', authorization_image_voice: 'ok', authorization_participation: 'ok' };
}
