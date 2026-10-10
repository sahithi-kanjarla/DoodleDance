// Starts the party server (:8787) AND the Vite dev server together.
// Extra args go to Vite, e.g.  npm run dev -- --port 5000
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const run = (args) => spawn(process.execPath, args, { stdio: 'inherit' });
// vite's package "exports" hides bin/vite.js, so locate it through package.json (which is exported)
const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const procs = [run(['server/server.js']), run([vite, '--host', ...process.argv.slice(2)])];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('exit', stop);
procs.forEach((p) => p.on('exit', (c) => { if (c) { console.log('A process exited with code', c); stop(); } }));
