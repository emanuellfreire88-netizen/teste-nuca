const { spawn } = require('child_process');
const fs = require('fs');

const logFd = fs.openSync('/home/z/my-project/dev.log', 'a');

// Parse .env manually — the sandbox shell has a stale SQLite DATABASE_URL
// that must NOT be passed to the dev server. Read .env here and inject the
// Neon PostgreSQL connection strings explicitly so they always win.
function loadEnvFile(path) {
  const vars = {};
  if (!fs.existsSync(path)) return vars;
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

const envVars = loadEnvFile('/home/z/my-project/.env');

const child = spawn('bun', ['run', 'dev'], {
  cwd: '/home/z/my-project',
  env: {
    ...process.env,
    ...envVars, // .env wins over stale shell env (Neon over SQLite)
    HOSTNAME: '0.0.0.0',
    PORT: '3000',
    JWT_SECRET:
      envVars.JWT_SECRET ||
      '4ece643801b9b0268dda6125ceb1cb51e8d01d1855bd64b8e7496f1f33297821',
  },
  detached: true,
  stdio: ['ignore', logFd, logFd]
});

child.unref();
console.log('Dev server PID:', child.pid);
console.log(
  'DATABASE_URL:',
  (envVars.DATABASE_URL || '(unset)').slice(0, 60) + '...'
);
process.exit(0);
