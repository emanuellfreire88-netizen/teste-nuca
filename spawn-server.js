const { spawn } = require('child_process');
const fs = require('fs');

const logFd = fs.openSync('/home/z/my-project/dev.log', 'a');

const child = spawn('bun', ['run', 'dev'], {
  cwd: '/home/z/my-project',
  env: {
    ...process.env,
    HOSTNAME: '0.0.0.0',
    PORT: '3000',
    DATABASE_URL: 'file:/home/z/my-project/db/custom.db',
    JWT_SECRET: '4ece643801b9b0268dda6125ceb1cb51e8d01d1855bd64b8e7496f1f33297821',
  },
  detached: true,
  stdio: ['ignore', logFd, logFd]
});

child.unref();
console.log('Dev server PID:', child.pid);
process.exit(0);
