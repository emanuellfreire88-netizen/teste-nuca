# ETAPA 1 — AUDITORIA DA INFRAESTRUTURA DE IA EXISTENTE

## Inventário

### 1. Z.ai SDK (z-ai-web-dev-sdk)
- **Versão instalada**: ^0.0.17
- **Status**: ✅ Funcionando (testado — responde corretamente)
- **Uso atual**: ❌ NENHUM — o SDK está instalado mas não é importado em nenhum arquivo de `src/`
- **Localização**: Disponível apenas para backend (server-side)
- **API key**: Não necessária (SDK usa credenciais embutidas do ambiente Z.ai)

### 2. Skills disponíveis no projeto
| Skill | Tipo | Uso |
|---|---|---|
| LLM | Chat completions | Disponível, não integrado |
| VLM | Visão (imagens) | Disponível, não integrado |
| TTS | Texto para voz | Disponível, não integrado |
| ASR | Voz para texto | Disponível, não integrado |
| web-search | Busca web | Disponível, não integrado |
| web-reader | Leitura web | Disponível, não integrado |
| image-generation | Geração de imagens | Disponível, não integrado |

### 3. Variáveis de ambiente de IA
- **Nenhuma configurada** — o Z.ai SDK não requer API key externa
- Sem OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.

### 4. APIs de IA no backend
- **Nenhuma existe** — não há rotas `/api/ai/` ou similares
- O SDK está disponível mas sem endpoints que o utilizem

### 5. Componentes de IA no frontend
- **Nenhum componente de IA** — o `floating-support-button` é para suporte humano, não IA
- Não há chatbot, assistente, ou interface de IA

### 6. Prompts existentes
- **Nenhum prompt** no código do projeto

### 7. Permissões, logs, consumo de tokens
- **Nada implementado** — sem controle de tokens, rate limit, ou auditoria de IA

## Resumo

| Item | Status |
|---|---|
| Z.ai SDK instalado | ✅ |
| Z.ai SDK funcionando | ✅ |
| Z.ai SDK usado no projeto | ❌ |
| APIs de IA | ❌ Nenhuma |
| Componentes de IA | ❌ Nenhum |
| Controle de permissões IA | ❌ Nenhum |
| Controle de custos IA | ❌ Nenhum |
| Auditoria de IA | ❌ Nenhuma |
| Proteção contra prompt injection | ❌ Nenhuma |

## Decisão de Arquitetura

A infraestrutura de IA está **completamente verde** — o SDK está pronto mas nada foi construído em cima dele. Isso é vantajoso porque podemos arquitetar do zero com segurança adequada.

### Arquitetura proposta:
1. **Backend**: API `/api/ai/assistant` que usa Z.ai SDK
2. **Tools**: Funções controladas que a IA pode chamar (sem acesso direto ao banco)
3. **Permissões**: IA herda as permissões do usuário autenticado
4. **Minimização**: IA recebe apenas dados agregados, nunca dados pessoais
5. **Auditoria**: Toda interação registrada em `ActionLog`
6. **Rate limit**: Limite de requisições por usuário/dia
7. **Frontend**: Componente NUCA IA no dashboard
