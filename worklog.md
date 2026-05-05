---
Task ID: 1
Agent: main
Task: Fix delete button not working across all CRUD pages

Work Log:
- Investigated the delete button issue across schools-page.tsx, students-page.tsx, users-page.tsx
- Found TWO root causes:
  1. AlertDialogAction from Radix UI auto-closes dialog on click, preventing async delete from completing
  2. api.ts was sending Content-Type: application/json header for ALL requests including DELETE, which crashed the Next.js server
- Fix 1: Replaced AlertDialogAction with regular Button component in all three pages
- Fix 2: Modified getAuthHeaders() in api.ts to only send Content-Type for POST/PUT/PATCH methods
- Verified all DELETE API endpoints work correctly (schools, students, users)
- Verified lint passes with no errors
- Verified dev server compiles and runs correctly

Stage Summary:
- Root cause #1: AlertDialogAction auto-closes dialog, preventing async operations
- Root cause #2: Content-Type: application/json on DELETE requests crashed the server
- Fixed schools-page.tsx: replaced AlertDialogAction with Button
- Fixed students-page.tsx: replaced AlertDialogAction with Button  
- Fixed users-page.tsx: replaced AlertDialogAction with Button
- Fixed api.ts: Content-Type only sent for methods with body (POST/PUT/PATCH)
- All backend DELETE APIs confirmed working (200 status)
