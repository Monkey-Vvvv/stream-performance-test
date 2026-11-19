import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const sampler = spawn('powershell.exe', ['-NoProfile', '-File', fileURLToPath(new URL('./sample.ps1', import.meta.url))], { windowsHide: true });
let latest = null;
sampler.on('error', console.error);
sampler.stderr.pipe(process.stderr);
createInterface({ input: sampler.stdout }).on('line', line => {
    try { latest = JSON.parse(line); } catch {}
});
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify(latest && Date.now() - latest.time < 5000 ? latest : null));
    }
    const name = path === '/' ? 'index.html' : path.slice(1);
    if (!/^[a-zA-Z0-9-]+\.(html|js|wasm)$/.test(name)) {
        res.writeHead(404).end();
        return;
    }
    const file = join(root, name);
    try {
        if (!statSync(file).isFile()) throw new Error();
        res.writeHead(200, { 'Content-Type': types[extname(file)] });
        createReadStream(file).pipe(res);
    } catch {
        res.writeHead(404).end();
    }
});
server.on('error', error => { sampler.kill(); throw error; });
process.on('exit', () => sampler.kill());
server.listen(8787, '127.0.0.1', () => console.log('http://127.0.0.1:8787'));
