import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIds } from '@/lib/user-schools';
import { logAction } from '@/lib/logger';
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { executeAITool, getToolsDescription, AIToolContext } from '@/lib/ai-tools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// ─── Rate limiting for AI (stricter than normal) ────────────────────────────
const AI_RATE_LIMIT = { windowMs: 60 * 1000, maxRequests: 5 }; // 5 requests per minute

// ─── Prompt injection patterns ─────────────────────────────────────────────
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(your|all|previous)\s+instructions/i,
  /ignore\s+(as regras|as instruções|suas instruções)/i,
  /disregard\s+(your|all)\s+(previous\s+)?instructions/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /system\s*:\s*/i,
  /show\s+(me\s+)?(all|every)\s+(secrets|passwords|tokens|api\s+keys|connection\s+strings)/i,
  /execute\s+(sql|query|command)/i,
  /drop\s+table/i,
  /delete\s+from/i,
  /insert\s+into/i,
  /update\s+.*\s+set/i,
  /show\s+(me\s+)?the\s+(database|neon|postgres)/i,
  /what\s+is\s+the\s+(password|secret|token|api\s+key)/i,
  /give\s+me\s+(admin|root|super)\s+access/i,
  /bypass\s+(security|permissions|authorization)/i,
];

function detectPromptInjection(text: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

// ─── System prompt for the NUCA IA ─────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o NUCA IA, um assistente interno do sistema NUCA (Núcleo de Cidadania dos Adolescentes).

REGRAS OBRIGATÓRIAS:
1. Você é uma ferramenta de APOIO. Você NÃO toma decisões. Você apenas analisa, resume e sugere.
2. Você NUNCA revela dados pessoais de adolescentes (CPF, RG, telefone, endereço, nome do responsável).
3. Você NUNCA revela secrets, senhas, tokens, ou credenciais do sistema.
4. Você NUNCA executa SQL, comandos, ou acessa o banco diretamente.
5. Você SEMPRE respeita as permissões do usuário conectado.
6. Você NUNCA inventa dados. Se não souber, diga "Não tenho dados suficientes para responder."
7. Use linguagem clara e profissional em português.
8. Diferencie sempre: DADO REAL (do sistema), CÁLCULO, INFERÊNCIA, e SUGESTÃO.
9. Nunca afirme causalidade sem evidência. Use "foi observado" em vez de "causado por".
10. Quando sugerir ações, deixe claro que são apenas recomendações e a decisão é do usuário.

FERRAMENTAS DISPONÍVEIS (você pode chamar APENAS estas):
${getToolsDescription()}

Para usar uma ferramenta, responda com: CALL_TOOL:nome_da_ferramenta
Exemplo: CALL_TOOL:getDashboardMetrics

Após receber o resultado da ferramenta, formule sua resposta baseada APENAS nos dados retornados.`;

// ─── POST: AI Assistant endpoint ───────────────────────────────────────────
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    // ─── Rate limiting ─────────────────────────────────────────────────────
    const rateLimitResult = applyRateLimit(req, 'ai_assistant', AI_RATE_LIMIT);
    if (rateLimitResult) {
      return NextResponse.json(
        { error: rateLimitResult.body.error },
        { status: rateLimitResult.status, headers: { 'Retry-After': String(rateLimitResult.body.retryAfter) } }
      );
    }

    // ─── Parse input ──────────────────────────────────────────────────────
    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Mensagem é obrigatória' },
        { status: 400 }
      );
    }

    // ─── Limit message size ───────────────────────────────────────────────
    if (message.length > 2000) {
      return NextResponse.json(
        { error: 'Mensagem muito longa (máximo 2000 caracteres)' },
        { status: 400 }
      );
    }

    // ─── Prompt injection detection (ETAPA 5) ─────────────────────────────
    if (detectPromptInjection(message)) {
      // Log the attempt but don't reveal the detection to the user
      await logAction(
        req.user!.userId,
        'ai_prompt_injection_blocked',
        `Tentativa de prompt injection bloqueada: "${message.substring(0, 100)}..."`,
        req
      );

      return NextResponse.json({
        reply: 'Não posso processar essa solicitação. O NUCA IA é uma ferramenta de apoio para análise de dados do sistema e não pode executar comandos, acessar dados privilegiados, ou ignorar regras de segurança.',
      });
    }

    // ─── Build AI context with user permissions (ETAPA 4) ────────────────
    const allowedSchoolIds = await getUserSchoolIds(req.user!.userId, req.user!.role);
    const aiContext: AIToolContext = {
      userId: req.user!.userId,
      userRole: req.user!.role,
      allowedSchoolIds,
    };

    // ─── Call Z.ai SDK ────────────────────────────────────────────────────
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    // First pass: let the AI decide which tool to call
    const firstResponse = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      stream: false,
      thinking: { type: 'disabled' },
    });

    const aiReply = firstResponse.choices?.[0]?.message?.content || '';

    // ─── Check if AI wants to call a tool ─────────────────────────────────
    const toolMatch = aiReply.match(/CALL_TOOL:(\w+)/);
    let finalReply = aiReply;

    if (toolMatch) {
      const toolName = toolMatch[1];

      // Validate tool exists
      if (!getToolsDescription().includes(toolName)) {
        finalReply = 'Não tenho uma ferramenta disponível para responder a essa pergunta.';
      } else {
        // Execute the tool with user's permissions
        const toolResult = await executeAITool(toolName, aiContext);

        if (toolResult.success && toolResult.data) {
          // Second pass: let the AI formulate a response based on the tool data
          const secondResponse = await zai.chat.completions.create({
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: message },
              { role: 'assistant', content: aiReply },
              { role: 'user', content: `Resultado da ferramenta ${toolName}:\n${JSON.stringify(toolResult.data, null, 2)}\n\nFormule uma resposta clara e objetiva baseada APENAS nestes dados. Não invente números.` },
            ],
            stream: false,
            thinking: { type: 'disabled' },
          });

          finalReply = secondResponse.choices?.[0]?.message?.content || 'Não foi possível processar a resposta.';
        } else {
          finalReply = `Erro ao obter dados: ${toolResult.error || 'erro desconhecido'}`;
        }
      }
    }

    // ─── Audit log (ETAPA 17) ─────────────────────────────────────────────
    await logAction(
      req.user!.userId,
      'ai_assistant_query',
      `Pergunta: "${message.substring(0, 100)}" | Tool: ${toolMatch?.[1] || 'none'}`,
      req
    );

    return NextResponse.json({
      reply: finalReply,
      toolUsed: toolMatch?.[1] || null,
    });
  } catch (error) {
    console.error('AI assistant error:', error);
    return NextResponse.json(
      { error: 'Erro ao processar solicitação da IA' },
      { status: 500 }
    );
  }
});
