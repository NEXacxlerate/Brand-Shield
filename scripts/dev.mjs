// One command per side of the app (no extra dependencies):
//   npm run backend    API on http://localhost:8000 (applies pending database migrations first)
//   npm run frontend   BrandShield on http://localhost:5173 and Brand Studio on :3000 (BrandShield forwards /studio to it)
// Ctrl+C stops everything that was started. First run installs missing packages.
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const target = process.argv[2];
const children = [];

function run(name, cmd, args, cwd, color) {
  const useShell = win && /npm|npx/.test(cmd);
  const child = useShell ? spawn(`${cmd} ${args.join(' ')}`, { cwd, shell: true, env: process.env }) : spawn(cmd, args, { cwd, env: process.env });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => out.write(tag + l + '\n')));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) {
      console.log(`${tag}stopped (exit ${code}); stopping the rest`);
      stop(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

let stopping = false;
function stop(code = 0) {
  stopping = true;
  for (const c of children) {
    try {
      if (win) spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
      else c.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

function ensureNodeModules(dir, label) {
  if (existsSync(path.join(dir, 'node_modules'))) return;
  console.log(`Installing ${label} packages (first run)...`);
  const r = spawnSync(win ? 'npm install' : 'npm', win ? [] : ['install'], { cwd: dir, stdio: 'inherit', shell: win });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function portBusy(port) {
  // a server is listening if a connection succeeds (on IPv4 or IPv6: Vite binds "localhost", which may be either)
  const tryHost = (host) =>
    new Promise((resolve) => {
      const sock = net.connect({ port, host });
      sock.setTimeout(800);
      sock.once('connect', () => (sock.destroy(), resolve(true)));
      sock.once('timeout', () => (sock.destroy(), resolve(false)));
      sock.once('error', () => resolve(false));
    });
  return Promise.all([tryHost('127.0.0.1'), tryHost('::1')]).then((r) => r.some(Boolean));
}

async function requireFreePorts(ports) {
  const busy = [];
  for (const p of ports) if (await portBusy(p)) busy.push(p);
  if (busy.length) {
    console.error(`Port ${busy.join(', ')} is already in use. Close the old server (or the other terminal running this app) and run the command again.`);
    process.exit(1);
  }
}

if (target === 'frontend') {
  await requireFreePorts([5173, 3000]);
  const web = path.join(root, 'frontend');
  const studio = path.join(root, 'studio');
  ensureNodeModules(web, 'BrandShield');
  ensureNodeModules(studio, 'Brand Studio');
  console.log('BrandShield  http://localhost:5173   (open this one; Brand Studio is at /studio/)\nBrand Studio http://localhost:3000/studio/ (redirects to the one above)\n');
  run('studio', 'npm', ['run', 'dev'], studio, '35');
  run('web   ', 'npm', ['run', 'dev'], web, '36');
} else if (target === 'backend') {
  await requireFreePorts([8000]);
  const api = path.join(root, 'backend');
  const venvPython = path.join(api, '.venv', win ? 'Scripts/python.exe' : 'bin/python');
  const python = existsSync(venvPython) ? venvPython : win ? 'python' : 'python3';
  if (!existsSync(venvPython)) {
    console.log('No backend/.venv found: creating it and installing requirements (first run)...');
    const mk = spawnSync(python, ['-m', 'venv', '.venv'], { cwd: api, stdio: 'inherit' });
    if (mk.status !== 0) process.exit(mk.status ?? 1);
    const py = path.join(api, '.venv', win ? 'Scripts/python.exe' : 'bin/python');
    const pip = spawnSync(py, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: api, stdio: 'inherit' });
    if (pip.status !== 0) process.exit(pip.status ?? 1);
  }
  const py = existsSync(venvPython) ? venvPython : python;
  const mig = spawnSync(py, ['-m', 'alembic', 'upgrade', 'head'], { cwd: api, stdio: 'inherit' });
  if (mig.status !== 0) {
    console.error('Database migration failed: check DATABASE_URL in backend/.env');
    process.exit(mig.status ?? 1);
  }
  console.log('API http://localhost:8000   (health: /health/live, docs: /docs)\n');
  run('api', py, ['-m', 'uvicorn', 'app.main:create_app', '--factory', '--port', '8000', '--reload', '--reload-dir', 'app'], api, '33');
} else {
  console.error('Usage: node scripts/dev.mjs frontend|backend');
  process.exit(1);
}
