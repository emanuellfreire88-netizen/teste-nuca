---
Task ID: 1
Agent: Main
Task: Fix errors and verify security level for Nuca Plataforma

Work Log:
- Restarted dev server (was not running, causing preview to not show)
- Ran ESLint - no errors found
- Audited all API routes and frontend components
- Fixed JWT_SECRET: Added to .env file (was using hardcoded fallback)
- Fixed middleware: Changed from fail-open to fail-closed when DB lookup fails
- Fixed auth/me: No longer leaks two_factor_secret field
- Fixed pagination: Added limit cap at 100 to prevent DoS
- Fixed next.config.ts: Removed forced Content-Type: application/json on API routes (broke uploads)
- Fixed DB logging: Changed from logging all queries to warn/error only
- Added input validation: Email format, field length limits, CPF validation
- Removed unnecessary api/route.ts "Hello world" endpoint
- Security headers already present: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Permissions-Policy

Stage Summary:
- All security vulnerabilities addressed
- Preview is now showing (server was down, restarted)
- API tests pass: login, auth/me, schools, students, security checks
- Pagination limit capped at 100 (verified: limit=999 returns limit=100)
- two_factor_secret no longer leaked in auth/me response
- No-token and bad-token access properly blocked (401)
- Wrong password properly blocked with attempt counting
- Server running on port 3000, homepage returns HTTP 200
