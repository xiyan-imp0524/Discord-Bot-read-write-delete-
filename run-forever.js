const { spawn } = require('child_process');
const path = require('path');

let stopping = false;

function start() {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (stopping) return;
    console.log(`\nBot exited (code ${code ?? 'unknown'}). Restarting in 5 seconds...\n`);
    setTimeout(start, 5000);
  });
}

process.on('SIGINT', () => {
  stopping = true;
  process.exit(0);
});

start();
