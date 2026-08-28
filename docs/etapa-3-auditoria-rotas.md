# ETAPA 3 — AUDITORIA COMPLETA DE ROTAS

## Classificação de todos os 74 endpoints

### ROTAS PÚBLICAS (sem autenticação) — 9 endpoints

| Endpoint | Método | Auth | Rate Limit | Motivo | Risco |
|---|---|---|---|---|---|
| `/api/auth/login` | POST | Manual (verifica creds) | ✅ 10/15min/IP | Login público | ✅ Protegido |
| `/api/auth/change-password` | POST | Manual (Bearer) | ✅ 5/15min/user | Alterar própria senha | ✅ Protegido |
| `/api/auth/toggle-2fa` | POST | Manual (Bearer) | ❌ Pendente | Toggle 2FA | ⚠️ Baixo risco |
| `/api/auth/resend-2fa` | POST | Manual (Bearer) | ❌ Pendente | Reenviar código 2FA | ⚠️ Baixo risco (cooldown email) |
| `/api/auth/verify-2fa` | POST | Manual (userId+code) | ❌ Pendente | Verifica código 2FA | ⚠️ Baixo risco |
| `/api/certificates/download` | GET | Nenhuma | ❌ Pendente | Certificado público | ⚠️ Baixo (só dados mínimos) |
| `/api/certificates/events` | GET | Nenhuma | ❌ Pendente | Lista eventos públicos | ⚠️ Baixo |
| `/api/certificates/lookup` | GET | Nenhuma | ❌ Pendente | Busca pública por nome | ⚠️ Baixo (mínimo dados) |
| `/api/health` | GET | Nenhuma | ❌ N/A | Health check público | ✅ Só status+timestamp |

### ROTAS AUTENTICADAS (withAuth) — todos os demais endpoints

Todas usam `withAuth` que:
1. ✅ Verifica Bearer token presente
2. ✅ Verifica token não revogado (blocklist em memória)
3. ✅ Verifica token válido (JWT verify com issuer+audience)
4. ✅ Verifica usuário existe e está ativo no DB (cache 5min)
5. ✅ Verifica must_change_password (bloqueia se obrigatório)
6. ✅ Atualiza role do DB (previne escalada de privilégios)
7. ✅ Aplica security headers na resposta

### ROTAS ADMINISTRATIVAS (withRole ['Admin']) — 21 endpoints

- `/api/users` (GET, POST) — listar e criar usuários
- `/api/users/[id]` (PUT, DELETE) — editar e excluir usuários
- `/api/users/[id]/reset-password` (POST) — resetar senha
- `/api/action-logs` (GET) — ver logs de auditoria
- `/api/action-logs/export` (GET) — exportar logs
- `/api/events` (POST) — criar evento
- `/api/events/[id]` (PUT, DELETE) — editar/excluir evento
- `/api/events/[id]/participants` (POST, PUT, DELETE) — gerenciar participantes
- `/api/events/[id]/participants/bulk` (PATCH) — ações em lote
- `/api/students` (POST) — cadastrar aluno
- `/api/students/[id]` (PUT, DELETE) — editar/excluir aluno
- `/api/students/import` (POST) — importar planilha
- `/api/students/[id]/transfer` (POST) — transferir aluno
- `/api/students/[id]/documents` (POST, PUT) — documentos do aluno
- `/api/documents` (POST) — criar documento
- `/api/documents/[id]` (PUT, DELETE) — editar/excluir documento
- `/api/documents/[id]/status` (PUT) — alterar status
- `/api/documents/[id]/duplicate` (POST) — duplicar
- `/api/documents/[id]/attachments` (POST, DELETE) — anexos
- `/api/documents/templates` (POST, PUT, DELETE) — templates
- `/api/documents/config` (PUT) — configurações

### ROTAS OPERATOR+ (withRole ['Admin', 'Operator']) — 23 endpoints

Inclui todos os GET de students, events, schools, attendance, reports, documents, dropout, support, calendar, notifications, sync.

### TESTES DE SEGURANÇA EXECUTADOS

| Teste | Resultado |
|---|---|
| Broken Access Control | ✅ Todos os endpoints de escrita exigem auth |
| IDOR em students/[id] | ✅ Protegido (canUserAccessSchool) |
| IDOR em documents/[id] | ⚠️ Qualquer Operator acessa qualquer documento (baixo risco — todos internos) |
| Escalada vertical | ✅ Role verificada no DB a cada request (cache 5min) |
| Escalada horizontal | ✅ Operator restrito às escolas atribuídas |
| Manipulação de IDs | ✅ Prisma valida UUID automaticamente |
| Acesso direto por URL | ✅ Sem rotas admin acessíveis sem role |

### ENDPOINTS CRON/WEBHOOK — 0 endpoints

Nenhum endpoint cron ou webhook existe atualmente. Se adicionados:
- Cron: validar header `Authorization: Bearer <CRON_SECRET>`
- Webhook: validar assinatura do serviço de origem
