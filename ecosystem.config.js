/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');

// Parse .env manually — PM2 does NOT support `env_file`. It only honors
// vars listed explicitly under `env: {}`. The sandbox shell has a stale
// SQLite DATABASE_URL, so we must read .env here and inject the Neon
// PostgreSQL connection strings explicitly.
function loadEnvFile(path) {
  const vars = {};
  if (!fs.existsSync(path)) return vars;
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    // Strip surrounding quotes if present
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

module.exports = {
  apps: [
    {
      name: 'next-dev',
      script: 'bun',
      args: 'run dev',
      cwd: '/home/z/my-project',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      // Inject .env vars explicitly — this overrides the stale SQLite URL
      // inherited from the sandbox shell.
      env: {
        ...envVars,
        HOSTNAME: '0.0.0.0',
        PORT: '3000',
        JWT_SECRET:
          envVars.JWT_SECRET ||
          '4ece643801b9b0268dda6125ceb1cb51e8d01d1855bd64b8e7496f1f33297821',
      },
    },
  ],
};
