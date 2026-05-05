---
Task ID: 2-3
Agent: backend-developer
Task: Build complete backend API

Work Log:
- Created auth utilities (`/src/lib/auth.ts`): JWT token generation/verification, password hashing/comparison, role-based helpers
- Created middleware (`/src/lib/middleware.ts`): withAuth and withRole wrappers for API route protection
- Created action logger (`/src/lib/logger.ts`): logAction helper that auto-extracts IP and device info from requests
- Created seed script (`/src/lib/seed.ts`): Creates default admin user (admin@nuca.com / Admin@123)
- Created auth routes:
  - POST `/api/auth/login` - Login with email/password, account lockout after 5 failed attempts (30 min)
  - GET `/api/auth/me` - Get current user info (protected)
  - POST `/api/auth/logout` - Logout action logging (protected)
- Created user routes:
  - GET `/api/users` - List all users (Admin only)
  - POST `/api/users` - Create user (Admin only)
  - GET `/api/users/[id]` - Get user by ID (Admin only)
  - PUT `/api/users/[id]` - Update user (Admin only)
  - DELETE `/api/users/[id]` - Delete user (Admin only, cannot delete self)
- Created school routes:
  - GET `/api/schools` - List schools with student count (all authenticated)
  - POST `/api/schools` - Create school (Admin, Operator)
  - GET `/api/schools/[id]` - Get school with students (all authenticated)
  - PUT `/api/schools/[id]` - Update school (Admin, Operator)
  - DELETE `/api/schools/[id]` - Delete school (Admin only, checks for linked students)
- Created student routes:
  - GET `/api/students` - List students with pagination, search, filters (all authenticated)
  - POST `/api/students` - Create student (Admin, Operator)
  - GET `/api/students/[id]` - Get student with school info (all authenticated)
  - PUT `/api/students/[id]` - Update student (Admin, Operator)
  - DELETE `/api/students/[id]` - Delete student (Admin only)
- Created attendance routes:
  - GET `/api/attendance` - List attendance records with filters (all authenticated)
  - POST `/api/attendance` - Create/update attendance with upsert on student_id+date (Admin, Operator)
  - GET `/api/attendance/export` - Export attendance as Excel or PDF (Admin, Operator)
- Created reports routes:
  - GET `/api/reports` - Dashboard data (students per school, active/inactive, attendance summary)
  - GET `/api/reports/export` - Export reports as Excel or PDF by type (students|attendance|schools)
- Created action log routes:
  - GET `/api/action-logs` - List action logs with filters and pagination (Admin only)
  - GET `/api/action-logs/export` - Export action logs as Excel or PDF (Admin only)
- Created upload route:
  - POST `/api/upload` - Upload photo files (JPG/PNG, max 5MB, saved to /public/uploads/)
- Ran seed script successfully, created default admin user
- Tested all key endpoints (login, auth/me, schools CRUD, users, action-logs, reports, logout)

Stage Summary:
- All 17 API route files created and functional
- 4 utility files created (auth, middleware, logger, seed)
- Default admin user seeded (admin@nuca.com / Admin@123)
- All endpoints tested and returning correct responses
- JWT authentication and role-based access control working correctly
- Action logging operational on all mutating operations
- Export functionality (Excel/PDF) implemented for attendance, reports, and action logs
