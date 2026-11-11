// Static server for the viewer (Node built-ins only).
//   node workbench/serve.mjs [--lan] [--port=8080]
// Default: 127.0.0.1 only. --lan: all interfaces, and the LAN URL(s) are printed for a phone on the same network.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const args = process.argv.slice(2);
const lan = args.includes('--lan');
const port = Number((args.find((a) => a.startsWith('--port=')) || '').slice(7)) || 8080;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.jpg': 'image/jpeg', '.png': 'image/png' };
const roots = [['/vendor/', path.join(repo, 'tools', 'vendor')], ['/pictures/', path.join(repo, 'pictures')], ['/', here]];

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const [prefix, dir] of roots) {
    if (!url.startsWith(prefix)) continue;
    const f = path.resolve(dir, url === '/' ? 'index.html' : url.slice(prefix.length));
    if (!f.startsWith(dir + path.sep) && f !== dir) break;
    if (prefix === '/' && (f.startsWith(path.join(here, 'out')) || f === path.join(here, 'serve.mjs') || f === path.join(here, 'shots.mjs'))) break;
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) continue;
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
    return;
  }
  res.writeHead(404); res.end('not found');
});
server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  const q = '/index.html?sheet=m1-pool15-e5&stats=1';
  console.log(`local: http://127.0.0.1:${port}${q}`);
  if (lan) {
    for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`phone: http://${i.address}:${port}${q}`);
    console.log('The phone must be on the same Wi-Fi. If it does not open, allow Node through the firewall.');
  }
  console.log('(press Ctrl+C to stop)');
});
