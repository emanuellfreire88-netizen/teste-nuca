# Nuca Project - Worklog

## Task 2-a: Socket.IO Chat Mini-Service
**Date**: 2026-06-15
**Status**: ✅ Completed

### What was done
- Created `/home/z/my-project/mini-services/chat-service/` as an independent bun project
- Created `package.json` with `socket.io` dependency
- Created `index.ts` with full Socket.IO server implementation on port 3003
- Installed dependencies via `bun install`
- Started the service with `bun --hot index.ts` — confirmed listening on port 3003
- Verified `GET /health` returns `{"status":"ok"}`

### Implementation details
- **Port**: 3003 (hardcoded)
- **Auth middleware**: Checks for `token` in `socket.handshake.auth.token` or `socket.handshake.query.token`; rejects connections without token
- **Socket events**:
  - `join-ticket` — joins room `ticket:<id>`, broadcasts `user-joined` to room
  - `leave-ticket` — leaves room `ticket:<id>`, broadcasts `user-left` to room
  - `send-message` — validates ticket_id + content, broadcasts `new-message` to room (including sender)
  - `typing` — broadcasts `typing` event to room (excluding sender)
  - `ticket-updated` — broadcasts `ticket-updated` to room with timestamp
- **REST endpoint**: `GET /health` → `{"status":"ok"}`
- **CORS**: Open (`origin: "*"`)
- **Frontend connection**: `io("/?XTransformPort=3003")`

### Files created
- `/home/z/my-project/mini-services/chat-service/package.json`
- `/home/z/my-project/mini-services/chat-service/index.ts`
- `/home/z/my-project/mini-services/chat-service/bun.lock`

---

## Task 3: Support Ticket API Endpoints
**Date**: 2026-03-04
**Status**: ✅ Completed

### What was done
Created 4 API route files for the support ticket/chat system following existing project patterns (withAuth/withRole wrappers, Next.js 16 async params, Portuguese error messages, action logging).

### Files created
- `/home/z/my-project/src/app/api/support/tickets/route.ts`
- `/home/z/my-project/src/app/api/support/tickets/[id]/route.ts`
- `/home/z/my-project/src/app/api/support/tickets/[id]/messages/route.ts`
- `/home/z/my-project/src/app/api/support/tickets/[id]/read/route.ts`

### Implementation details

#### 1. GET/POST `/api/support/tickets`
- **GET**: List tickets with pagination. Authenticated users see only their own tickets; Admin/Operator sees all. Supports `status`, `page`, `limit`, `search` query params. Returns tickets with user/assignee info and message count.
- **POST**: Create ticket with `subject` + `content` (first message). Auto-generates protocol `SUP-YYYY-NNNN`. Optional `priority` field (defaults to "normal"). Returns full ticket with messages.

#### 2. GET/PUT `/api/support/tickets/[id]`
- **GET**: Single ticket with all messages (including sender info). Ownership check: non-admin can only view own tickets.
- **PUT**: Update status/priority/assigned_to. Admin/Operator only. Validates status (`open|in_progress|resolved|closed`), priority (`low|normal|high|urgent`), and assignee must be Admin/Operator role.

#### 3. GET/POST `/api/support/tickets/[id]/messages`
- **GET**: Paginated messages with sender info. Ownership check enforced.
- **POST**: Send message to ticket. Marks all other users' messages as read. Prevents sending to closed tickets. Returns message with sender info.

#### 4. PUT `/api/support/tickets/[id]/read`
- Marks all messages NOT sent by the current user as `is_read: true`. Returns count of updated messages.

### Key design decisions
- Protocol generation uses `count` query filtered by year with `padStart(4, '0')`
- Dynamic routes use the `(req, context) => withAuth(async (...) => { ... })(req, context)` pattern to properly access async `context.params`
- All user selects exclude password/sensitive fields
- All actions logged via `logAction`
- Error messages in Portuguese
- Security headers applied automatically by withAuth/withRole wrappers
