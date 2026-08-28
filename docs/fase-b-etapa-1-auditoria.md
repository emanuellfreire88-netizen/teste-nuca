# ETAPA 1 — AUDITORIA DAS FUNCIONALIDADES EXISTENTES E SUBUTILIZADAS

## Inventário Completo

### Tabelas com dados (funcionando)
| Tabela | Registros | Status |
|---|---|---|
| user | 5 | ✅ Funcionando |
| school | 4 | ✅ Funcionando |
| student | 71 | ✅ Funcionando |
| event | 3 | ✅ Funcionando |
| eventParticipant | 82 | ✅ Funcionando |
| attendanceRecord | 82 | ✅ Funcionando |
| actionLog | 717 | ✅ Funcionando |
| supportTicket | 1 | ✅ Funcionando |
| docManagementDocument | 5 | ✅ Funcionando |
| docManagementTemplate | 2 | ✅ Funcionando |
| documentTemplate | 2 | ✅ Funcionando |

### Tabelas VAZIAS (estrutura existe, sem uso)
| Tabela | Status | Problema | Recomendação |
|---|---|---|---|
| **notification** | ⚠️ VAZIA | Tabela + API existem, mas NENHUMA notificação é criada automaticamente. Sem gatilhos. | **CRÍTICO**: Ativar gatilhos de notificação (Etapa 5) |
| **calendarEvent** | ⚠️ VAZIA | API POST/PUT/DELETE existe e funciona, frontend completo. Usuário não cadastrou eventos. | Baixo: funcional, só não usado |
| **dropoutRiskAssessment** | ⚠️ VAZIA | Algoritmo existe (dropout-risk.ts), API POST existe (manual), mas sem execução automática. | **CRÍTICO**: Implementar cron automático (Etapa 2) |
| **dropoutFollowUp** | ⚠️ VAZIA | API POST existe, frontend tem formulário. Depende de risk assessments existirem. | Consequência do item acima |
| **studentDocument** | ⚠️ VAZIA | API existe (students/[id]/documents), mas não há interface para usar. | Médio: criar interface na ficha do aluno |
| **participationBadge** | ⚠️ VAZIA | API events/badges existe, mas não há gatilho automático. | Médio: gerar badges automaticamente após eventos |
| **session** | ⚠️ VAZIA | Modelo existe mas NÃO é usado (auth é stateless via JWT). | Baixo: pode remover modelo no futuro |
| **syncRecord** | ⚠️ VAZIA | Sync offline existe no frontend, mas só registra se usuário usar offline. | Baixo: funcional, só não usado |
| **studentTransfer** | ⚠️ VAZIA | API existe (students/[id]/transfer), mas nenhuma transferência feita. | Baixo: funcional, só não usado |
| **userSchool** | ⚠️ VAZIA | Estrutura de permissões por escola existe, mas nenhum Operator tem escola atribuída. | Médio: admin precisa atribuir escolas aos Operators |

### APIs existentes vs utilizadas

| API | Métodos | Frontend usa? | Status |
|---|---|---|---|
| `/api/dropout` | GET, POST | ✅ dropout-page.tsx (botão "Calcular Riscos") | ⚠️ Manual apenas |
| `/api/dropout/dashboard` | GET | ✅ dropout-page.tsx | ✅ Funcionando |
| `/api/dropout/follow-ups` | GET, POST | ✅ dropout-page.tsx | ✅ Funcionando |
| `/api/dropout/[studentId]` | GET | ✅ dropout-page.tsx | ✅ Funcionando |
| `/api/notifications` | GET, POST, PUT | ✅ notification-bell.tsx (GET/PUT) | ⚠️ Nenhuma notificação criada via POST interno |
| `/api/calendar` | GET, POST, PUT, DELETE | ✅ calendar-page.tsx | ✅ Funcionando (vazio por desuso) |
| `/api/students/[id]/documents` | GET, POST, PUT | ❌ Sem interface | ⚠️ Backend sem frontend |
| `/api/events/badges` | GET, POST | ❌ Sem interface direta | ⚠️ Sem gatilho automático |
| `/api/students/[id]/transfer` | POST | ❌ Sem interface direta | ⚠️ Backend sem frontend |

### Funcionalidades parcialmente implementadas

| Funcionalidade | O que existe | O que falta | Prioridade |
|---|---|---|---|
| **Detecção de evasão** | Algoritmo completo (5 critérios), API POST manual | Cron job automático | CRÍTICA |
| **Notificações** | Tabela, API GET/PUT, componente NotificationBell | Gatilhos que CRIAM notificações | CRÍTICA |
| **Dashboard de evasão** | API dashboard, componente | Integração com dashboard principal | ALTA |
| **Follow-ups de evasão** | API, formulário no frontend | Depende de risk assessments existirem | ALTA |
| **Checklist de documentos** | Tabela, API | Interface na ficha do aluno | MÉDIA |
| **Badges de participação** | Tabela, API | Gatilho automático pós-evento | MÉDIA |
| **Transferência de alunos** | API | Interface | BAIXA |
| **Permissões por escola** | Tabela userSchool, middleware | Admin atribuir escolas aos Operators | MÉDIA |

### Resumo de prioridades

#### 🔴 CRÍTICO (bloqueia o fluxo operacional)
1. **Detecção automática de evasão** — algoritmo existe mas é manual. Sem execução automática, todo o fluxo (alerta → notificação → acompanhamento) não funciona.
2. **Gatilhos de notificação** — tabela existe mas está vazia. Sem notificações, alertas não chegam aos responsáveis.

#### 🟠 ALTA (melhora significativamente a operação)
3. **Dashboard de pendências** — integrar alertas de evasão no dashboard principal
4. **Sistema de acompanhamento** — follow-ups existem mas dependem de risk assessments

#### 🟡 MÉDIA (complementar)
5. **Checklist de documentos** — interface para usar API existente
6. **Badges automáticos** — gerar após eventos
7. **Permissões por escola** — atribuir escolas aos Operators

#### 🟢 BAIXA (não urgente)
8. Transferência de alunos (interface)
9. Remoção do modelo Session (não usado)
