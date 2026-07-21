# Task 4-5: PDF Generation API Endpoints

## Summary
Created two PDF generation API endpoints for the NUCA school management system.

## Files Created
1. `src/app/api/students/[id]/profile-pdf/route.ts` - Student Profile PDF (GET)
2. `src/app/api/students/authorization-pdf/route.ts` - Trip Authorization PDF (POST)

## Endpoint Details

### 1. Student Profile PDF (`GET /api/students/[id]/profile-pdf`)
- **Auth**: withAuth (any authenticated user)
- **Access Control**: canUserAccessSchool check
- **Format**: A4 landscape
- **Data Fetched**: Student + school, attendance_records (last 30), event_participations, badges, dropout_risk_assessments, documents
- **PDF Sections**: Header, Student Info, School, Guardian, Medical, Dropout Risk, Documents Checklist, Attendance Summary, Event Participations, Badges, Footer
- **Branding**: NUCA teal (#0d9488), autoTable for tabular data
- **Output**: application/pdf with Content-Disposition

### 2. Trip Authorization PDF (`POST /api/students/authorization-pdf`)
- **Auth**: withRole(['Admin', 'Operator'])
- **Body**: student_ids[], event_title, event_date, event_location, departure_time?, return_time?, responsible_name?, observations?
- **Format**: A4 portrait
- **Per-student**: Name/class/grade/school, guardian info, auth checkbox, signature lines, declaration
- **Layout**: ~2 students per page, light teal background boxes
- **Output**: application/pdf with Content-Disposition

## Patterns Followed
- `withAuth`/`withRole` middleware from `@/lib/middleware`
- `db` from `@/lib/db` (Neon HTTP adapter)
- `logAction` from `@/lib/logger`
- `jsPDF` + `jspdf-autotable` for PDF generation
- `Buffer.from(doc.output('arraybuffer'))` for PDF buffer
- Next.js 16 `context.params` as Promise (awaited)
- `export const dynamic = 'force-dynamic'`, `runtime = 'nodejs'`, `maxDuration = 30`

## Lint Status
0 errors, 0 warnings after cleanup.
