# ETAPA 8 — BACKUP, RECUPERAÇÃO E TESTE DE RESTORE

## Estratégia de Backup

### 1. Neon PostgreSQL (PITR — Point-in-Time Recovery)
- **Provedor**: Neon (plano gratuito inclui 7 dias de PITR)
- **Frequência**: Contínuo (WAL streaming)
- **Retenção**: 7 dias (plano gratuito) / 30 dias (plano pago)
- **Responsável**: Administrador do Neon
- **Acesso**: https://console.neon.tech → Project → Backup & Restore

### 2. Backup Externo Complementar (RECOMENDADO)
- **Ferramenta**: `pg_dump` via Vercel Cron (semanal)
- **Destino**: Vercel Blob Storage ou S3
- **Frequência**: Todo domingo às 03:00 UTC
- **Retenção**: 4 semanas (4 backups)
- **Formato**: `neon-backup-YYYY-MM-DD.sql.gz`

### 3. Backup de Arquivos (uploads, templates)
- **Templates PDF**: `templates/pdf-templates/memorando-base.pdf` — no Git (versionado)
- **Imagens do template**: `public/images/doc-templates/` — no Git (versionado)
- **Anexos de documentos**: Armazenados como base64 no Postgres (backup junto com o banco)
- **Fotos de perfil**: Base64 no Postgres (backup junto com o banco)

## Procedimentos de Restauração

### Cenário 1: Exclusão acidental de registros
```bash
# 1. Identificar o horário da exclusão
# 2. Usar PITR do Neon para restaurar para antes do incidente
#    Console Neon → Branches → Create branch from timestamp
# 3. Exportar os dados da branch restaurada
# 4. Importar os dados de volta para a branch principal
```

### Cenário 2: Corrupção de dados
```bash
# 1. Criar uma branch de restore no Neon (timestamp anterior)
# 2. Verificar integridade dos dados na branch
# 3. Se OK, promover a branch ou copiar dados
```

### Cenário 3: Credenciais comprometidas
```bash
# 1. Rotacionar senha do Neon (Neon API ou Console)
# 2. Atualizar DATABASE_URL e DIRECT_URL na Vercel
# 3. Atualizar .env local
# 4. Redeploy
# 5. Revogar todos os JWT tokens (limpar cache de roles)
# 6. Forçar reset de senha de todos os usuários
```

### Cenário 4: Restauração completa (desastre)
```bash
# 1. Criar novo projeto Neon
# 2. Restaurar do backup mais recente (pg_dump)
#    psql $NEW_DATABASE_URL < neon-backup-YYYY-MM-DD.sql
# 3. Atualizar DATABASE_URL na Vercel
# 4. Redeploy
# 5. Verificar integridade:
#    curl https://nuca-plataforma.vercel.app/api/health
```

## Teste de Restore (NÃO EXECUTAR EM PRODUÇÃO)

### Procedimento de teste (em ambiente de desenvolvimento):
1. Criar uma branch de teste no Neon: `git checkout -b test-restore`
2. Fazer pg_dump da branch de teste
3. Restaurar em um banco local
4. Verificar contagens de registros
5. Verificar integridade referencial
6. Registrar tempo necessário

### Verificação de integridade pós-restore:
```sql
-- Verificar contagens
SELECT 'users' as table, count(*) FROM users
UNION ALL SELECT 'students', count(*) FROM students
UNION ALL SELECT 'schools', count(*) FROM schools
UNION ALL SELECT 'events', count(*) FROM events
UNION ALL SELECT 'documents', count(*) FROM doc_management_documents;

-- Verificar integridade referencial
SELECT COUNT(*) FROM students s WHERE NOT EXISTS (
  SELECT 1 FROM schools WHERE id = s.school_id
);
```

## RPO e RTO

| Métrica | Valor | Justificativa |
|---|---|---|
| RPO (Recovery Point Objective) | 7 dias (PITR) | Plano gratuito do Neon |
| RTO (Recovery Time Objective) | 2 horas | Tempo para restore + verificação |

## Responsabilidades

| Papel | Responsabilidade |
|---|---|
| Admin do Neon | Configurar e monitorar PITR |
| Admin do Sistema | Executar restore quando necessário |
| Vercel | Manter variáveis de ambiente atualizadas |
| Desenvolvedor | Documentar procedimentos e manter scripts |
