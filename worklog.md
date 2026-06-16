# Nuca Project - Worklog

## Task 2-a: Socket.IO Chat Mini-Service
**Date**: 2026-06-15
**Status**: ✅ Completed

### What was done
- Created `/home/z/my-project/mini-services/chat-service/` as an independent bun project
- Created `package.json` with `socket.io` dependency
- Created `index.ts` with full Socket.IO server implementation on port 3003
- Installed dependencies via `bun install`
- Started the service with `bun --hot index.ts` — confirmed listening on port 3003
- Verified `GET /health` returns `{"status":"ok"}`

### Implementation details
- **Port**: 3003 (hardcoded)
- **Auth middleware**: Checks for `token` in `socket.handshake.auth.token` or `socket.handshake.query.token`; rejects connections without token
- **Socket events**:
  - `join-ticket` — joins room `ticket:<id>`, broadcasts `user-joined` to room
  - `leave-ticket` — leaves room `ticket:<id>`, broadcasts `user-left` to room
  - `send-message` — validates ticket_id + content, broadcasts `new-message` to room (including sender)
  - `typing` — broadcasts `typing` event to room (excluding sender)
  - `ticket-updated` — broadcasts `ticket-updated` to room with timestamp
- **REST endpoint**: `GET /health` → `{"status":"ok"}`
- **CORS**: Open (`origin: "*"`)
- **Frontend connection**: `io("/?XTransformPort=3003")`

### Files created
- `/home/z/my-project/mini-services/chat-service/package.json`
- `/home/z/my-project/mini-services/chat-service/index.ts`
- `/home/z/my-project/mini-services/chat-service/bun.lock`

---

## Task 3: Support Ticket API Endpoints
**Date**: 2026-03-04
**Status**: ✅ Completed

### What was done
Created 4 API route files for the support ticket/chat system following existing project patterns (withAuth/withRole wrappers, Next.js 16 async params, Portuguese error messages, action logging).

### Files created
- `/home/z/my-project/src/app/api/support/tickets/route.ts`
- `/home/z/my-project/src/app/api/support/tickets/[id]/route.ts`
- `/home/z/my-project/src/app/api/support/tickets/[id]/messages/route.ts`
- `/home/z/my-project/src/app/api/support/tickets/[id]/read/route.ts`

### Implementation details

#### 1. GET/POST `/api/support/tickets`
- **GET**: List tickets with pagination. Authenticated users see only their own tickets; Admin/Operator sees all. Supports `status`, `page`, `limit`, `search` query params. Returns tickets with user/assignee info and message count.
- **POST**: Create ticket with `subject` + `content` (first message). Auto-generates protocol `SUP-YYYY-NNNN`. Optional `priority` field (defaults to "normal"). Returns full ticket with messages.

#### 2. GET/PUT `/api/support/tickets/[id]`
- **GET**: Single ticket with all messages (including sender info). Ownership check: non-admin can only view own tickets.
- **PUT**: Update status/priority/assigned_to. Admin/Operator only. Validates status (`open|in_progress|resolved|closed`), priority (`low|normal|high|urgent`), and assignee must be Admin/Operator role.

#### 3. GET/POST `/api/support/tickets/[id]/messages`
- **GET**: Paginated messages with sender info. Ownership check enforced.
- **POST**: Send message to ticket. Marks all other users' messages as read. Prevents sending to closed tickets. Returns message with sender info.

#### 4. PUT `/api/support/tickets/[id]/read`
- Marks all messages NOT sent by the current user as `is_read: true`. Returns count of updated messages.

### Key design decisions
- Protocol generation uses `count` query filtered by year with `padStart(4, '0')`
- Dynamic routes use the `(req, context) => withAuth(async (...) => { ... })(req, context)` pattern to properly access async `context.params`
- All user selects exclude password/sensitive fields
- All actions logged via `logAction`
- Error messages in Portuguese
- Security headers applied automatically by withAuth/withRole wrappers

---
Task ID: DB-RESTORE
Agent: Main Agent
Task: Restaurar conexão com banco de dados Neon após troca acidental de URL na Vercel

Work Log:
- Investigado o problema: dados sumiram após troca acidental da URL do banco na Vercel
- Encontrada a URL da Neon fornecida pelo usuário: `ep-orange-brook-apv361yg-pooler.c-7.us-east-1.aws.neon.tech`
- Testada conexão direta com a Neon via driver HTTP (@neondatabase/serverless) - FUNCIONOU
- Confirmados dados na Neon: 1 usuário, 4 escolas, 68 alunos, 1 evento, 25 participações, 25 frequências, 285 logs
- Problema: sandbox bloqueia porta 5432 (TCP), mas driver HTTP da Neon funciona
- Tentado usar @prisma/adapter-neon para Prisma - não funcionou no sandbox (erro de conexão pg)
- Solução: Sincronizado dados da Neon para SQLite local usando better-sqlite3 + @neondatabase/serverless
- Criado script de sincronização que lê da Neon via HTTP e escreve no SQLite local
- Schema Prisma mantido como SQLite para dev local
- Criado `prisma/schema.vercel.prisma` com PostgreSQL para deploy na Vercel
- Criado `build-vercel.sh` que detecta ambiente Vercel e troca schema para PostgreSQL
- Atualizado package.json build script para usar `bash build-vercel.sh`
- Criado `.env.vercel` com instruções para configurar variáveis de ambiente na Vercel
- Aplicação verificada funcionando: login, dashboard (68 alunos, 4 escolas), páginas de escolas/alunos/eventos

Stage Summary:
- ✅ Dados da Neon recuperados e sincronizados localmente
- ✅ Aplicação funcionando com dados completos (1 user, 4 schools, 68 students, 1 event, 25 participations)
- ✅ Configuração de deploy Vercel criada (schema.vercel.prisma + build-vercel.sh)
- ⚠️ Usuário precisa configurar variáveis de ambiente na Vercel:
  - DATABASE_URL (Neon pooler URL)
  - DIRECT_URL (Neon direct URL)
  - JWT_SECRET
- 📁 Arquivos criados: prisma/schema.vercel.prisma, build-vercel.sh, .env.vercel
- 📁 Arquivos modificados: .env, prisma/schema.prisma (SQLite), package.json, spawn-server.js

---
Task ID: DB-RESTORE-FIX
Agent: Main Agent
Task: Corrigir configuração Neon após usuário fornecer URL novamente (continuação do DB-RESTORE)

Work Log:
- Verificado estado atual: dev server rodando, SQLite local com dados (1 user, 4 schools, 68 students, 1 event, 25 participations, 25 attendance, 285 logs)
- Verificado Neon via HTTP driver (@neondatabase/serverless): banco intacto com TODOS os dados reais
  - users: 1, schools: 4, students: 68, events: 1, event_participants: 25, attendance_records: 25, action_logs: 285
  - Admin user: emanuell.fp.rocha@gmail.com (Emanuell Freire)
- Encontrado BUG crítico em .env e .env.vercel: NEON_DIRECT_URL e DIRECT_URL continham "-pooler" no hostname
  - DIRECT_URL NÃO pode usar pooler (Prisma migrations/db push falham com pooler)
  - Corrigido: removido "-pooler" do hostname das DIRECT URLs
- Recriado scripts/sync-neon-to-sqlite.js (estava referenciado no package.json mas o arquivo não existia)
  - Script usa @neondatabase/serverless (HTTP, funciona no sandbox) para ler da Neon
  - Escreve no SQLite local via better-sqlite3 em transação síncrona
  - Testado: 409 rows copiadas com sucesso (Neon → SQLite)
- Atualizado .env com comentários explicativos e URLs corretas
- Atualizado .env.vercel com DIRECT_URL correta (sem -pooler) e instruções detalhadas
- Verificado prisma/schema.vercel.prisma: PostgreSQL + directUrl + @db.Text na descrição ✓
- Verificado build-vercel.sh: troca schema para PostgreSQL no build da Vercel ✓
- Dev server confirmado funcionando após sync (APIs respondendo, auth gate operacional)

Stage Summary:
- ✅ BUG CRÍTICO CORRIGIDO: DIRECT_URL não usa mais pooler (era a causa provável do problema na Vercel)
- ✅ Dados da Neon confirmados intactos (banco de produção não foi perdido)
- ✅ SQLite local ressincronizado com dados frescos da Neon (409 rows)
- ✅ Script de sync recriado e funcional: `bun run sync:neon`
- ⚠️ Usuário PRECISA atualizar variáveis na Vercel:
  - DATABASE_URL = pooler URL (com -pooler)
  - DIRECT_URL   = direct URL (SEM -pooler) ← isto era o bug
  - JWT_SECRET
- 📁 Arquivos modificados: .env, .env.vercel, scripts/sync-neon-to-sqlite.js (novo)

---
Task ID: DB-RESTORE-PUSH
Agent: Main Agent
Task: Diagnosticar e corrigir "não está indo" - deploy da Vercel não funcionava

Work Log:
- Usuário reportou que o deploy na Vercel não estava funcionando
- Investigado git status: descoberto que 4 commits locais NÃO haviam sido enviados (push) para o GitHub
- Origin/main (o que a Vercel via) tinha configuração QUEBRADA:
  - prisma/schema.prisma com provider = "sqlite" (deveria ser postgresql)
  - package.json build script antigo: "prisma generate && (prisma db push || true) && next build"
  - SEM build-vercel.sh
  - SEM prisma/schema.vercel.prisma
  - Causa: Prisma gerava client SQLite, mas DATABASE_URL era PostgreSQL → build falhava
- Validado schema.vercel.prisma: ✓ válido (com DIRECT_URL definida)
- Testado prisma generate com schema SQLite + DATABASE_URL postgres: ✓ funciona (não valida URL na geração)
- Feito git push origin main: 4 commits enviados com sucesso (c22c4b9..0de3846)
- Verificado arquivos críticos agora presentes no origin/main:
  - build-vercel.sh ✓
  - prisma/schema.vercel.prisma (provider = postgresql) ✓
  - package.json (build = "bash build-vercel.sh") ✓
  - scripts/sync-neon-to-sqlite.js ✓
- Dev server local confirmado funcionando após push

Stage Summary:
- ✅ CAUSA RAIZ ENCONTRADA: commits não estavam no GitHub → Vercel buildava código antigo com schema SQLite
- ✅ Push feito: todos os arquivos de deploy PostgreSQL agora no GitHub
- ✅ Vercel agora fará build com: schema PostgreSQL + build-vercel.sh + Neon connection
- ⚠️ Usuário PRECISA confirmar que as 3 variáveis de ambiente estão setadas na Vercel:
  - DATABASE_URL (pooler, com -pooler)
  - DIRECT_URL (direta, SEM -pooler) ← bug corrigido anteriormente
  - JWT_SECRET
- 📁 Nenhum arquivo modificado (apenas git push)

---
Task ID: DB-RESTORE-NEON-SUSPENDED
Agent: Main Agent
Task: Diagnosticar problema Neon+Vercel - banco mostrando SUSPENDED no screenshot do usuário

Work Log:
- Usuário enviou screenshot mostrando console da Neon
- VLM analisou a imagem: banco "Primary" (ep-orange-brook-apv361yg) com status SUSPENDED há 5 minutos
- Diagnosticado: é comportamento NORMAL do plano gratuito da Neon (autosuspend após inatividade)
- Testado se banco acorda: via HTTP driver acordou em <1s, dados intactos (1 user, 4 schools, 68 students, 1 event, 285 logs)
- Problema real: durante build da Vercel, `prisma db push` via TCP pode dar timeout no cold start do Neon
- Melhorado build-vercel.sh com mitigação de cold start:
  - Loop de probe TCP (6 tentativas, 5s timeout cada) para "acordar" o banco antes do db push
  - Extrai host do DATABASE_URL via sed
  - Retry do `prisma db push` (3 tentativas com sleep 5s entre elas)
  - Se db push falhar mesmo assim, continua o build (schema pode já estar sincronizado)
- Commitado e enviado para GitHub (push origin main)
- Banco confirmado ativo após testes

Stage Summary:
- ✅ SUSPENDED é normal no Neon free tier (não é erro permanente)
- ✅ Banco acorda automaticamente ao receber conexão, dados intactos
- ✅ build-vercel.sh melhorado com cold-start mitigation (probe + retry)
- ✅ Push enviado para GitHub, Vercel fará novo deploy com script robusto
- 💡 O banco suspende após ~5 min sem atividade; primeiro request após suspensão pode demorar 5-15s
- 📁 Arquivo modificado: build-vercel.sh
