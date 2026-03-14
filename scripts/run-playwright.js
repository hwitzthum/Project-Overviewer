#!/usr/bin/env node

const { spawn } = require('child_process');

const env = { ...process.env };
if (env.NO_COLOR) {
  delete env.NO_COLOR;
}

const cliPath = require.resolve('@playwright/test/cli');
const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
