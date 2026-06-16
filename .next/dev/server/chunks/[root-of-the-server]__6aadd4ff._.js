module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[project]/src/lib/db.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "db",
    ()=>db
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/node_modules/@prisma/client)");
;
const globalForPrisma = globalThis;
const db = globalForPrisma.prisma ?? new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["PrismaClient"]({
    log: ("TURBOPACK compile-time truthy", 1) ? [
        'warn',
        'error'
    ] : "TURBOPACK unreachable"
});
if ("TURBOPACK compile-time truthy", 1) globalForPrisma.prisma = db;
}),
"[externals]/buffer [external] (buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("buffer", () => require("buffer"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("stream", () => require("stream"));

module.exports = mod;
}),
"[externals]/util [external] (util, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("util", () => require("util"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[project]/src/lib/auth.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "JWT_EXPIRES_IN_SECONDS",
    ()=>JWT_EXPIRES_IN_SECONDS,
    "comparePassword",
    ()=>comparePassword,
    "generateToken",
    ()=>generateToken,
    "hasRole",
    ()=>hasRole,
    "hashPassword",
    ()=>hashPassword,
    "isAdmin",
    ()=>isAdmin,
    "isOperatorOrAbove",
    ()=>isOperatorOrAbove,
    "sanitizeInput",
    ()=>sanitizeInput,
    "validatePasswordStrength",
    ()=>validatePasswordStrength,
    "verifyToken",
    ()=>verifyToken
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jsonwebtoken$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/jsonwebtoken/index.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$bcryptjs$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/bcryptjs/index.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
;
;
;
// JWT_SECRET: Must be set in production. Lazy initialization to avoid build-time crashes.
// Uses globalThis to persist the secret across Next.js hot reloads.
const globalForAuth = globalThis;
function getJwtSecret() {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    // In production (runtime), JWT_SECRET must be set
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    // Reuse the same secret across hot reloads in development
    if (!globalForAuth.__jwtSecret) {
        console.warn('⚠️  JWT_SECRET not set. Using random fallback for development only. Set JWT_SECRET in production!');
        globalForAuth.__jwtSecret = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["randomBytes"])(32).toString('hex');
    }
    return globalForAuth.__jwtSecret;
}
const JWT_EXPIRES_IN = '24h';
const JWT_EXPIRES_IN_SECONDS = 24 * 60 * 60; // 86400 seconds
const JWT_ISSUER = 'nuca-plataforma';
const JWT_AUDIENCE = 'nuca-plataforma-users';
function generateToken(payload) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jsonwebtoken$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].sign(payload, getJwtSecret(), {
        expiresIn: JWT_EXPIRES_IN,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
    });
}
function verifyToken(token) {
    try {
        const decoded = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$jsonwebtoken$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].verify(token, getJwtSecret(), {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        });
        return decoded;
    } catch  {
        return null;
    }
}
async function hashPassword(password) {
    const salt = await __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$bcryptjs$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].genSalt(12);
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$bcryptjs$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].hash(password, salt);
}
async function comparePassword(password, hash) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$bcryptjs$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].compare(password, hash);
}
function hasRole(userRole, requiredRoles) {
    return requiredRoles.includes(userRole);
}
function isAdmin(role) {
    return role === 'Admin';
}
function isOperatorOrAbove(role) {
    return role === 'Admin' || role === 'Operator';
}
function validatePasswordStrength(password) {
    const errors = [];
    if (password.length < 8) {
        errors.push('Mínimo de 8 caracteres');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Pelo menos uma letra maiúscula');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Pelo menos uma letra minúscula');
    }
    if (!/[0-9]/.test(password)) {
        errors.push('Pelo menos um número');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Pelo menos um caractere especial (!@#$%...)');
    }
    return {
        valid: errors.length === 0,
        errors
    };
}
function sanitizeInput(input) {
    return input.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').trim();
}
}),
"[project]/src/lib/middleware.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "isTokenRevoked",
    ()=>isTokenRevoked,
    "revokeToken",
    ()=>revokeToken,
    "withAuth",
    ()=>withAuth,
    "withRole",
    ()=>withRole
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
;
;
;
// ---------------------------------------------------------------------------
// Security headers applied to all API responses
// ---------------------------------------------------------------------------
function withSecurityHeaders(response) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('X-Content-Security-Policy', "default-src 'self'");
    return response;
}
const tokenBlocklist = new Map();
const BLOCKLIST_MAX_SIZE = 10000;
// Periodic cleanup of expired blocklist entries (every 10 minutes)
if (typeof setInterval !== 'undefined') {
    setInterval(()=>{
        const now = Date.now();
        for (const [token, entry] of tokenBlocklist.entries()){
            if (now >= entry.expiresAt) {
                tokenBlocklist.delete(token);
            }
        }
    }, 10 * 60 * 1000).unref?.();
}
function revokeToken(token) {
    // Evict oldest entries if blocklist is too large
    if (tokenBlocklist.size >= BLOCKLIST_MAX_SIZE) {
        const oldestKey = tokenBlocklist.keys().next().value;
        if (oldestKey) tokenBlocklist.delete(oldestKey);
    }
    tokenBlocklist.set(token, {
        expiresAt: Date.now() + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["JWT_EXPIRES_IN_SECONDS"] * 1000
    });
}
function isTokenRevoked(token) {
    const entry = tokenBlocklist.get(token);
    if (!entry) return false;
    // If expired, clean up and consider it not revoked (JWT itself is expired anyway)
    if (Date.now() >= entry.expiresAt) {
        tokenBlocklist.delete(token);
        return false;
    }
    return true;
}
// ---------------------------------------------------------------------------
// Cache verified user roles in memory with TTL to reduce DB queries
// ---------------------------------------------------------------------------
const userRoleCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 1000; // Prevent unbounded memory growth
// Periodic cleanup of expired cache entries (every 10 minutes)
if (typeof setInterval !== 'undefined') {
    setInterval(()=>{
        const now = Date.now();
        for (const [key, value] of userRoleCache.entries()){
            if (now - value.cachedAt > CACHE_TTL) {
                userRoleCache.delete(key);
            }
        }
    }, 10 * 60 * 1000).unref?.(); // Don't prevent process exit
}
async function verifyUserInDB(userId) {
    // Check cache first
    const cached = userRoleCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
        return {
            role: cached.role,
            status: cached.status
        };
    }
    // Evict oldest entries if cache is too large
    if (userRoleCache.size >= CACHE_MAX_SIZE) {
        const oldestKey = userRoleCache.keys().next().value;
        if (oldestKey) userRoleCache.delete(oldestKey);
    }
    try {
        const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true,
                role: true,
                status: true
            }
        });
        if (!user) return null;
        // Update cache
        userRoleCache.set(userId, {
            role: user.role,
            status: user.status,
            cachedAt: Date.now()
        });
        return {
            role: user.role,
            status: user.status
        };
    } catch  {
        // If DB fails, allow request with token data (fail open rather than blocking all access)
        console.error('Failed to verify user in DB, using token data');
        return null;
    }
}
function withAuth(handler) {
    return async (req, context)=>{
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return withSecurityHeaders(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Token não fornecido'
            }, {
                status: 401
            }));
        }
        const token = authHeader.split(' ')[1];
        // Check if token has been revoked (e.g. after logout)
        if (isTokenRevoked(token)) {
            return withSecurityHeaders(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Token inválido ou expirado'
            }, {
                status: 401
            }));
        }
        const payload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["verifyToken"])(token);
        if (!payload) {
            return withSecurityHeaders(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Token inválido ou expirado'
            }, {
                status: 401
            }));
        }
        // Verify user still exists and is active in the database
        // This prevents deleted or deactivated users from using old tokens
        const dbUser = await verifyUserInDB(payload.userId);
        if (dbUser === null) {
            // DB lookup failed - fail closed for security (block access)
            // This prevents unauthorized access when DB is unavailable
            return withSecurityHeaders(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Erro ao verificar credenciais. Tente novamente.'
            }, {
                status: 503
            }));
        }
        if (dbUser.status === 'inactive') {
            return withSecurityHeaders(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Conta desativada. Contate o administrador.'
            }, {
                status: 403
            }));
        }
        // Update the payload with the current role from DB
        // This prevents privilege escalation if role was changed after token was issued
        req.user = {
            ...payload,
            role: dbUser.role
        };
        const response = await handler(req, context);
        return withSecurityHeaders(response);
    };
}
function withRole(requiredRoles, handler) {
    return withAuth(async (req, context)=>{
        const user = req.user;
        if (!user || !requiredRoles.includes(user.role)) {
            return withSecurityHeaders(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Permissão insuficiente'
            }, {
                status: 403
            }));
        }
        const response = await handler(req, context);
        return withSecurityHeaders(response);
    });
}
}),
"[project]/src/lib/logger.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "logAction",
    ()=>logAction
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
;
async function logAction(userId, actionType, description, req) {
    try {
        let ipAddress = null;
        let device = null;
        if (req) {
            ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
            const userAgent = req.headers.get('user-agent');
            if (userAgent) {
                device = userAgent.substring(0, 255);
            }
        }
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].actionLog.create({
            data: {
                user_id: userId,
                action_type: actionType,
                description,
                ip_address: ipAddress,
                device
            }
        });
    } catch (error) {
        console.error('Failed to log action:', error);
    }
}
}),
"[project]/src/app/api/support/tickets/[id]/read/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PUT",
    ()=>PUT
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$middleware$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/middleware.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/logger.ts [app-route] (ecmascript)");
;
;
;
;
async function PUT(req, context) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$middleware$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["withAuth"])(async (_req)=>{
        try {
            const { id } = await context.params;
            const ticket = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].supportTicket.findUnique({
                where: {
                    id
                },
                select: {
                    id: true,
                    protocol: true,
                    user_id: true
                }
            });
            if (!ticket) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: 'Ticket não encontrado'
                }, {
                    status: 404
                });
            }
            // Non-admin users can only mark their own tickets as read
            const isAdminOrOperator = _req.user.role === 'Admin' || _req.user.role === 'Operator';
            if (!isAdminOrOperator && ticket.user_id !== _req.user.userId) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: 'Permissão insuficiente'
                }, {
                    status: 403
                });
            }
            // Mark all messages NOT sent by the current user as read
            const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].supportMessage.updateMany({
                where: {
                    ticket_id: id,
                    sender_id: {
                        not: _req.user.userId
                    },
                    is_read: false
                },
                data: {
                    is_read: true
                }
            });
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$logger$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logAction"])(_req.user.userId, 'mark_ticket_read', `Mensagens do ticket ${ticket.protocol} marcadas como lidas (${result.count} mensagens)`, _req);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                message: 'Mensagens marcadas como lidas',
                count: result.count
            });
        } catch (error) {
            console.error('Mark ticket read error:', error);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Erro interno do servidor'
            }, {
                status: 500
            });
        }
    })(req, context);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__6aadd4ff._.js.map