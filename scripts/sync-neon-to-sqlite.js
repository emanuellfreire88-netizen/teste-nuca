/**
 * Sync data from Neon (PostgreSQL) → local SQLite.
 *
 * Why this exists:
 *   The cloud sandbox blocks outbound TCP port 5432, so Prisma + Postgres
 *   cannot connect directly from local dev. Neon's HTTP driver
 *   (@neondatabase/serverless) works through HTTPS (port 443), so we pull
 *   data via that driver and write it into the local SQLite file that
 *   Prisma uses for development.
 *
 * Usage:
 *   bun run sync:neon
 *
 * Env vars (read from .env):
 *   NEON_URL — Neon pooler URL (postgresql://...neon.tech/...)
 *
 * Output:
 *   Overwrites all rows in the local SQLite database (db/custom.db) with
 *   fresh data from Neon. Safe to re-run (idempotent, uses INSERT OR REPLACE).
 */
const path = require('path');
const fs = require('fs');

// --- Load .env manually (no dotenv dependency) ---
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const NEON_URL = process.env.NEON_URL;
if (!NEON_URL) {
  console.error('❌ NEON_URL is not set. Check your .env file.');
  process.exit(1);
}

const Database = require('better-sqlite3');
const SQLITE_PATH = path.join(__dirname, '..', 'db', 'custom.db');

// Tables in dependency order (parents before children).
// Whitelisted — safe to interpolate into SQL strings.
const TABLES = [
  'users',
  'schools',
  'students',
  'participation_badges',
  'attendance_records',
  'action_logs',
  'sessions',
  'events',
  'event_participants',
  'support_tickets',
  'support_messages',
];

async function main() {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(NEON_URL, { arrayMode: false, fullResults: true });

  console.log('🔄 Syncing Neon → SQLite');
  console.log('   Source :', NEON_URL.replace(/:[^:@]+@/, ':****@'));
  console.log('   Target :', SQLITE_PATH);
  console.log('');

  // ---------- Phase 1: fetch all data from Neon (async) ----------
  const fetched = {};
  for (const table of TABLES) {
    try {
      const result = await sql.query(`SELECT * FROM "${table}";`);
      fetched[table] = result.rows || [];
      console.log(`  ↓ fetched ${table}: ${fetched[table].length} rows`);
    } catch (err) {
      console.error(`  ✗ failed to fetch ${table}: ${err.message}`);
      fetched[table] = [];
    }
  }

  // ---------- Phase 2: write to SQLite (sync transaction) ----------
  const sqlite = new Database(SQLITE_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = OFF');

  const writeAll = sqlite.transaction(() => {
    let total = 0;
    for (const table of TABLES) {
      const rows = fetched[table];
      sqlite.exec(`DELETE FROM "${table}";`);

      if (!rows.length) {
        console.log(`  • ${table}: 0 rows (cleared)`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const colList = columns.map((c) => `"${c}"`).join(', ');
      const insertStmt = sqlite.prepare(
        `INSERT OR REPLACE INTO "${table}" (${colList}) VALUES (${placeholders});`,
      );

      const insertMany = sqlite.transaction((batch) => {
        for (const row of batch) {
          insertStmt.run(...columns.map((c) => normalizeValue(row[c])));
        }
      });

      const BATCH = 200;
      for (let i = 0; i < rows.length; i += BATCH) {
        insertMany(rows.slice(i, i + BATCH));
      }

      total += rows.length;
      console.log(`  ✓ ${table}: ${rows.length} rows`);
    }
    return total;
  });

  console.log('');
  console.log('📝 Writing to SQLite...');
  const totalRows = writeAll();

  sqlite.pragma('foreign_keys = ON');

  // ---------- Verify ----------
  console.log('');
  console.log('📊 Final SQLite row counts:');
  for (const table of TABLES) {
    const { n } = sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}";`).get();
    console.log(`   ${table.padEnd(22)} ${n}`);
  }

  sqlite.close();
  console.log('');
  console.log(`✅ Sync complete. ${totalRows} total rows copied from Neon → SQLite.`);
}

/**
 * Normalize values from Postgres so SQLite accepts them.
 * - Date / DateTime → ISO string (Prisma SQLite stores DateTime as ISO text).
 * - boolean → 0 / 1 (SQLite has no native boolean).
 * - bigint → number.
 * - null/undefined → null.
 */
function normalizeValue(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'object') {
    // Postgres may return some types (numeric, jsonb) as objects.
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return v;
}

main().catch((err) => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
