const { spawn } = require('child_process');
const path = require('path');

function startServer() {
  console.log(`[${new Date().toISOString()}] Starting Next.js dev server...`);
  
  const child = spawn('node', [
    path.join(__dirname, 'node_modules/.bin/next'),
    'dev', '-p', '3000', '-H', '0.0.0.0'
  ], {
    cwd: __dirname,
    stdio: 'inherit',
    detached: false
  });

  child.on('exit', (code, signal) => {
    console.log(`[${new Date().toISOString()}] Server exited with code ${code}, signal ${signal}. Restarting in 3s...`);
    setTimeout(startServer, 3000);
  });

  child.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Failed to start: ${err.message}`);
    setTimeout(startServer, 3000);
  });
}

startServer();
