# Task 4 - Backend Agent - Document Management API Routes

## Summary
Created all 11 API route files for the Document Management (Gestão Documental) module under `/home/z/my-project/src/app/api/documents/`.

## Files Created

| # | Route File | Endpoints | Description |
|---|-----------|----------|-------------|
| 1 | `/api/documents/route.ts` | GET, POST | Main CRUD: list with pagination/filters/search, create with auto-number/protocol |
| 2 | `/api/documents/[id]/route.ts` | GET, PUT, DELETE | Single document: get with relations, update with change tracking, delete with status check |
| 3 | `/api/documents/[id]/status/route.ts` | PUT | Status transitions with validation of allowed flows |
| 4 | `/api/documents/[id]/duplicate/route.ts` | POST | Duplicate document with new number/protocol |
| 5 | `/api/documents/[id]/attachments/route.ts` | GET, POST, DELETE | Attachment upload/list/delete |
| 6 | `/api/documents/[id]/pdf/route.ts` | GET | PDF generation with pdf-lib, LiberationSans fonts |
| 7 | `/api/documents/[id]/history/route.ts` | GET | History entries with user info |
| 8 | `/api/documents/templates/route.ts` | GET, POST, PUT, DELETE | Template CRUD with soft-delete for defaults |
| 9 | `/api/documents/config/route.ts` | GET, PUT | Config management with auto-defaults |
| 10 | `/api/documents/dashboard/route.ts` | GET | Dashboard statistics |
| 11 | `/api/documents/protocols/route.ts` | GET | Protocol search (exact + partial match) |

## Key Patterns
- **Auth**: All routes use `withAuth` / `withRole` from `@/lib/middleware` (Admin/Operator = full access, Viewer = read only)
- **Database**: Prisma via `import { db } from '@/lib/db'` (Neon PostgreSQL)
- **Logging**: `logAction` from `@/lib/logger` for audit trail
- **Search**: `ciContains` from `@/lib/search` for case-insensitive PostgreSQL search
- **Params**: Next.js 16 pattern: `context.params` is Promise, must `await context.params`
- **Document numbering**: Auto-generate sequential number per document_type+year (e.g., "Ofício nº 001/2026")
- **Protocol numbering**: Auto-generate sequential protocol per year (e.g., "2026-000001")
- **PDF**: pdf-lib + @pdf-lib/fontkit with embedded LiberationSans TTF fonts (full Portuguese accent support)
- **Template vars**: {{numero_documento}}, {{protocolo}}, {{data}}, {{ano}}, {{destinatario}}, {{cargo_destinatario}}, {{instituicao}}, {{municipio}}

## Status
- Lint: 0 errors
- Dev server: running successfully
- Database: in sync with Prisma schema (db:push verified)
