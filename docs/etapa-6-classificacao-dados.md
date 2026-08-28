# ETAPA 6 — CLASSIFICAÇÃO E PROTEÇÃO DE DADOS

## Níveis de Classificação

### NÍVEL 1 — PÚBLICO
Dados que podem ser exibidos publicamente (certificados, eventos públicos).

| Campo | Modelo | Quem vê | Exporta | Em logs | IA |
|---|---|---|---|---|---|
| `Student.full_name` | Student | Público (certificados) | ✅ Admin/Op | ✅ | ❌ |
| `Event.title` | Event | Público | ✅ | ✅ | ❌ |
| `Event.date` | Event | Público | ✅ | ✅ | ❌ |
| `Event.location` | Event | Público | ✅ | ✅ | ❌ |
| `School.name` | School | Público | ✅ | ✅ | ❌ |

### NÍVEL 2 — INTERNO
Dados operacionais não destinados ao público.

| Campo | Modelo | Quem vê | Exporta | Em logs | IA |
|---|---|---|---|---|---|
| `Event.status` | Event | Autenticado | ✅ Admin/Op | ✅ | ❌ |
| `Event.category` | Event | Autenticado | ✅ | ✅ | ❌ |
| `EventParticipant.attended` | EventParticipant | Autenticado | ✅ | ✅ | ❌ |
| `AttendanceRecord.status` | AttendanceRecord | Autenticado | ✅ | ✅ | ❌ |
| `Notification.*` | Notification | Dono (user_id) | ❌ | ❌ | ❌ |
| `SupportTicket.*` | SupportTicket | Dono ou Admin | ❌ | ✅ metadata | ❌ |

### NÍVEL 3 — CONFIDENCIAL
Dados internos com acesso restrito.

| Campo | Modelo | Quem vê | Exporta | Em logs | IA |
|---|---|---|---|---|---|
| `User.role` | User | Admin | ✅ Admin | ✅ | ❌ |
| `User.status` | User | Admin | ✅ Admin | ✅ | ❌ |
| `User.last_login` | User | Admin | ✅ Admin | ✅ | ❌ |
| `ActionLog.*` | ActionLog | Admin | ✅ Admin | N/A (é log) | ❌ |
| `DocManagementConfig.*` | DocConfig | Admin | ❌ | ❌ | ❌ |

### NÍVEL 4 — DADOS PESSOAIS (LGPD)
Informações que identificam uma pessoa.

| Campo | Modelo | Quem vê | Exporta | Em logs | IA | Mascaramento |
|---|---|---|---|---|---|---|
| `User.email` | User | Admin + próprio | ✅ Admin | ❌ Nunca | ❌ | Parcial em UI |
| `User.full_name` | User | Admin + próprio | ✅ Admin | ✅ | ❌ | Não |
| `User.profile_photo` | User | Autenticado | ❌ | ❌ | ❌ | Não |
| `Student.cpf` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ Nunca | ❌ | Parcial (***.***.***-XX) |
| `Student.rg` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ Nunca | ❌ | Não |
| `Student.date_of_birth` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ | ❌ | Não |
| `Student.phone` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ | ❌ | Parcial |
| `Student.address` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ | ❌ | Não |
| `Student.guardian_name` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ | ❌ | Não |
| `Student.guardian_phone` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ | ❌ | Parcial |
| `Student.guardian_email` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ | ❌ | Parcial |
| `Student.emergency_contact` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ | ❌ | Não |
| `Student.blood_type` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ | ❌ | Não |
| `Student.special_needs` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ | ❌ | Não |
| `Student.medications` | Student | Admin/Op da escola | ✅ Admin/Op | ❌ | ❌ | Não |

### NÍVEL 5 — ALTAMENTE RESTRITO
Dados que exigem proteção reforçada.

| Campo | Modelo | Quem vê | Exporta | Em logs | IA |
|---|---|---|---|---|---|
| `User.password` | User | ❌ Ninguém (só hash) | ❌ Nunca | ❌ Nunca | ❌ |
| `User.two_factor_secret` | User | ❌ Ninguém | ❌ Nunca | ❌ Nunca | ❌ |
| `User.verification_code` | User | ❌ Ninguém | ❌ Nunca | ❌ Nunca | ❌ |
| `DocManagementAttachment.file_data` | DocAttach | Admin/Op (autor) | ❌ | ❌ | ❌ |

## MINIMIZAÇÃO DE DADOS NAS APIs

### Já implementado ✅
- `/api/auth/me` usa `select` explícito (não retorna password, two_factor_secret, verification_code)
- `/api/users` GET usa `select` explícito (não retorna password)
- Login response destrói `password` e `two_factor_secret` antes de retornar
- `/api/documents/[id]` GET não inclui `file_data` nos anexos (só metadados)

### Pendências identificadas
- `/api/students` GET retorna `include: { school: {...} }` — pode retornar campos desnecessários
- `/api/certificates/lookup` já minimiza (só full_name + event info) ✅

## PROTEÇÃO CONTRA ENVIO INDEVIDO PARA SERVIÇOS EXTERNOS

| Serviço | Dados enviados | Restrição |
|---|---|---|
| Neon PostgreSQL | Todos os dados | ✅ Criptografado em trânsito (sslmode=require) |
| Resend (email) | Apenas email + código 2FA | ✅ Não envia dados pessoais |
| Z.ai SDK | ❌ Não usado em produção | ✅ Instalado mas não integrado |
| Vercel | Logs de deploy | ✅ Não envia dados de usuários |
| Sentry | Stack traces + contexto | ⚠️ Ver ETAPA 9 — sanitização necessária |

## RECOMENDAÇÕES

1. **Mascarar CPF em listas**: Mostrar `***.***.***-XX` em vez do CPF completo na listagem de alunos
2. **Mascarar telefone**: Mostrar `(XX) *****-XXXX` em views não-editáveis
3. **Logs nunca devem conter**: password, hash, token, CPF, telefone, email, endereço
4. **IA nunca deve receber**: dados NÍVEL 4 ou 5 sem anonimização
