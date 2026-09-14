#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'incidents.json');
const PORT = Number(process.env.PORT) || 4173;
const OPEN_BROWSER = process.env.NO_OPEN !== '1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.incidents) ? parsed : { incidents: [] };
  } catch {
    return { incidents: [] };
  }
}

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, relative);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

async function handleApi(req, res) {
  const store = readStore();

  if (req.method === 'GET') {
    sendJson(res, 200, store);
    return;
  }

  if (req.method === 'PUT') {
    const body = await readBody(req);
    if (!Array.isArray(body.incidents)) {
      sendJson(res, 400, { error: 'expected { incidents: [] }' });
      return;
    }
    writeStore({ incidents: body.incidents });
    sendJson(res, 200, { ok: true, count: body.incidents.length });
    return;
  }

  sendJson(res, 405, { error: 'method not allowed' });
}

const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/api/incidents') {
    handleApi(req, res).catch(() => sendJson(res, 400, { error: 'bad request' }));
    return;
  }
  serveStatic(req, res);
});

function openBrowser(url) {
  const commands =
    process.platform === 'darwin'
      ? [['open', [url]]]
      : process.platform === 'win32'
        ? [['cmd', ['/c', 'start', '', url]]]
        : [['xdg-open', [url]]];
  for (const [cmd, args] of commands) {
    execFile(cmd, args, () => {});
  }
}

function listen(port, attemptsLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    console.error(`Incident Command failed to start: ${err.message}`);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`Incident Command running at ${url}`);
    console.log(`Data file: ${DATA_FILE}`);
    console.log('Press Ctrl+C to stop.');
    if (OPEN_BROWSER) openBrowser(url);
  });
}

listen(PORT, 10);
