---
Task ID: 1
Agent: main
Task: Fix delete button not working across all CRUD pages

Work Log:
- Investigated the delete button issue across schools-page.tsx, students-page.tsx, and users-page.tsx
- Identified the root cause: AlertDialogAction from Radix UI auto-closes dialog on click, preventing async delete operations
- Replaced AlertDialogAction with regular Button component in all three pages
- Removed unused AlertDialogAction imports from all three files
- Verified backend DELETE API endpoints work correctly
- Verified lint passes with no errors
- Verified dev server compiles and runs correctly

Stage Summary:
- Fixed delete button in schools-page.tsx
- Fixed delete button in students-page.tsx
- Fixed delete button in users-page.tsx
- Root cause: Radix UI AlertDialogAction auto-closes dialog, preventing async operations from completing
