# Task 7 - Schools Module Frontend

## Agent: frontend-developer

## Summary
Built the complete Schools module UI component for Nuca Plataforma.

## Files Created
- `/src/components/schools-page.tsx` — Full "use client" SchoolsPage component (~580 lines)

## Files Modified
- `/src/app/page.tsx` — Added SchoolsPage import and wired "schools" route

## Features Implemented

### 1. Schools List View
- Responsive: cards on mobile (lg:hidden), table on desktop (hidden lg:block)
- Search by school name with search icon input
- Student count badges using Badge component
- Click row/card to navigate to detail view
- "Nova Escola" button (hidden for Viewer role)
- Empty state with illustration and call-to-action
- Loading skeletons during data fetch

### 2. Create/Edit School Dialog
- Dialog component with form fields: name (required), address, phone, email, director_name, opening_hours, latitude, longitude
- Photo upload with preview (POST /api/upload as FormData)
- Remove photo button on hover
- Form validation (name required)
- Loading states on submit
- Role-based: only Admin/Operator can create/edit

### 3. School Detail View
- Back button to return to list
- All school info with icons (director, phone, email, hours, address, coordinates)
- School photo display
- OpenStreetMap iframe embed using lat/lng
- Empty state for map when no coordinates
- Student list with cards (mobile) and table (desktop)
- Student status badges (Ativo/Inativo)
- Edit button (Admin/Operator only)
- Delete button (Admin only)
- Loading skeletons during fetch

### 4. Delete Confirmation
- AlertDialog component
- Warning about linked students
- Loading state during deletion
- Admin-only access

## API Usage
- Uses `api` client from `@/lib/api` for all API calls
- Uses `useAuthStore` from `@/lib/auth-store` for role checking
- Photo upload uses raw `fetch` with FormData (not the JSON api client)
- Toast notifications via `sonner`

## Dev Server Status
- Compiles successfully with no errors
