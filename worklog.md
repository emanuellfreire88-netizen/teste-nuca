---
Task ID: 1
Agent: Main
Task: Fix delete button not working across all pages

Work Log:
- Identified the root cause: AlertDialogAction from Radix UI automatically closes the dialog when clicked, before the async delete operation completes
- Added `e?.preventDefault()` to all handleDelete functions to prevent the default close behavior
- Added `deleteLoading` state to StudentsPage component (was missing)
- Added `Loader2` import to students-page.tsx
- Updated AlertDialog in students-page to show loading spinner during delete
- Fixed all three pages: schools-page.tsx, students-page.tsx, users-page.tsx
- Seeded the database with admin user (database was empty)
- Verified all API endpoints work correctly with curl tests
- Server is running on port 3000, returning HTTP 200

Stage Summary:
- Delete button fix: Added event.preventDefault() to prevent AlertDialog from auto-closing before async delete completes
- Added proper loading states with spinner to student delete dialog
- Database seeded with admin user (admin@nuca.com / Admin@123)
- All delete APIs verified working: schools, students, users
