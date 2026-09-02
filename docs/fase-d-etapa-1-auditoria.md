# ETAPA 1 — AUDITORIA DOS MÓDULOS DE GESTÃO

## Diagnóstico

### Módulos funcionando (manter)
| Módulo | Componente | APIs | Tabela | Status |
|---|---|---|---|---|
| Adolescentes | students-page.tsx (3997 linhas) | 7 endpoints | Student (71) | ✅ Funcional |
| Escolas | schools-page.tsx (1204 linhas) | 2 endpoints | School (4) | ✅ Funcional |
| Eventos | events-page.tsx (4394 linhas) | 8 endpoints | Event (3) | ✅ Funcional |
| Frequência | attendance-page.tsx | 3 endpoints | AttendanceRecord (82) | ✅ Funcional |
| Gestão Documental | document-management-page.tsx + 10 sub | 11 endpoints | DocManagementDocument (5) | ✅ Funcional |
| Evasão | dropout-page.tsx (1441 linhas) | 4 endpoints | DropoutRiskAssessment (59) | ✅ Funcional |
| Calendário | calendar-page.tsx (1135 linhas) | 1 endpoint (CRUD) | CalendarEvent (0) | ✅ Funcional |
| Usuários | users-page.tsx | 3 endpoints | User (5) | ✅ Funcional |
| Suporte | support-page.tsx | 5 endpoints | SupportTicket (1) | ✅ Funcional |
| Relatórios | reports-page.tsx | 5 endpoints | — | ✅ Funcional |
| Logs | logs-page.tsx | 2 endpoints | ActionLog (717) | ✅ Funcional |
| Notificações | notification-bell.tsx | 1 endpoint | Notification (24) | ✅ Funcional |
| IA | nuca-ai-assistant.tsx | 1 endpoint | — | ✅ Funcional |

### Módulos com backend pronto mas sem interface
| Funcionalidade | API | Tabela | Problema |
|---|---|---|---|
| Checklist de documentos do aluno | /api/students/[id]/documents | StudentDocument (0) | ❌ Sem interface na ficha do aluno |
| Badges de participação | /api/events/badges | ParticipationBadge (0) | ❌ Sem interface + sem gatilho automático |
| Transferência de alunos | /api/students/[id]/transfer | StudentTransfer (0) | ❌ Sem interface |

### Módulos inexistentes (precisam ser criados)
| Funcionalidade | Status |
|---|---|
| Sistema de Tarefas | ❌ Não existe (nenhuma tabela, API ou componente) |
| Busca Global | ❌ Não existe |
| Dashboard Executivo com comparação temporal | ⚠️ Parcial (tem indicadores, sem comparação) |

### Funcionalidades duplicadas
Nenhuma duplicação real encontrada. DocumentTemplate e DocManagementTemplate têm propósitos distintos.

## Prioridades de Implementação

### CRÍTICO (criar do zero)
1. **Sistema de Tarefas** — não existe, é fundamental para gestão
2. **Busca Global** — não existe, melhora muito a produtividade

### ALTA (ativar existentes)
3. **Checklist de documentos** — interface na ficha do aluno
4. **Badges automáticos** — gatilho pós-evento
5. **Dashboard com comparação temporal** — melhorar dashboard atual

### MÉDIA (melhorar)
6. **Filtros avançados** — padronizar nos módulos
7. **Exportações profissionais** — adicionar metadados
8. **Calendário integrado com tarefas** — mostrar tarefas no calendário

### BAIXA (futuro)
9. Transferência de alunos (interface)
10. Arquivamento estruturado
11. Versionamento de documentos (já tem histórico)
