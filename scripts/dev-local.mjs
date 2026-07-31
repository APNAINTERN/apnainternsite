#!/usr/bin/env node
/** Start local API (:3000) then Vite (:8080). Ctrl+C stops both. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const server = spawn('node', ['server.cjs'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

let vite;
const startVite = () => {
  vite = spawn('npm', ['run', 'dev:frontend'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  vite.on('exit', (code) => {
    server.kill();
    process.exit(code ?? 0);
  });
};

setTimeout(startVite, 1200);

server.on('exit', (code) => {
  if (vite) vite.kill();
  if (code && code !== 0) process.exit(code);
});

process.on('SIGINT', () => {
  server.kill();
  if (vite) vite.kill();
  process.exit(0);
});
