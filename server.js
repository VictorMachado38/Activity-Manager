// Servidor local do Activity Manager: sem framework, sem banco — só serve os
// arquivos do build do Angular e persiste tudo num data.json neste diretório.
// Rodar depois de `npm run build`: `npm run server` (ou `node server.js`).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const STATIC_DIR = path.join(__dirname, 'dist', 'activity-manager', 'browser');

const EMPTY_STATE = { activities: [], shortcuts: [], credentials: [] };

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY_STATE, null, 2));
    return structuredClone(EMPTY_STATE);
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const parsed = raw.trim() ? JSON.parse(raw) : {};
  return { ...structuredClone(EMPTY_STATE), ...parsed };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = loadData();

function sendJson(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (chunk) => (chunks += chunk));
    req.on('end', () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

const COLLECTIONS = {
  activities: {
    defaults: () => ({ status: 'a_fazer', notes: null }),
    onCreate: (record) => ({ ...record, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    onUpdate: (record) => ({ ...record, updated_at: new Date().toISOString() }),
  },
  shortcuts: {
    defaults: () => ({ image_url: null }),
    onCreate: (record) => record,
    onUpdate: (record) => record,
  },
  credentials: {
    defaults: () => ({}),
    onCreate: (record) => record,
    onUpdate: (record) => record,
  },
};

async function handleApi(req, res, url) {
  const parts = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const [collectionName, id] = parts;
  const collection = COLLECTIONS[collectionName];

  if (!collection) {
    return sendJson(res, 404, { detail: 'recurso não encontrado' });
  }

  try {
    if (req.method === 'GET' && !id) {
      return sendJson(res, 200, data[collectionName]);
    }

    if (req.method === 'POST' && !id) {
      const body = await readBody(req);
      const record = collection.onCreate({
        id: crypto.randomUUID(),
        ...collection.defaults(),
        ...body,
      });
      data[collectionName].push(record);
      saveData(data);
      return sendJson(res, 201, record);
    }

    if (req.method === 'PUT' && collectionName === 'activities' && id === 'reorder') {
      const body = await readBody(req);
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const byId = new Map(data.activities.map((item) => [item.id, item]));
      const reordered = ids.map((activityId) => byId.get(activityId)).filter(Boolean);
      const missing = data.activities.filter((item) => !ids.includes(item.id));
      data.activities = [...reordered, ...missing];
      saveData(data);
      return sendJson(res, 200, data.activities);
    }

    if (req.method === 'PATCH' && id) {
      const index = data[collectionName].findIndex((item) => item.id === id);
      if (index === -1) return sendJson(res, 404, { detail: 'não encontrado' });
      const body = await readBody(req);
      const updated = collection.onUpdate({ ...data[collectionName][index], ...body });
      data[collectionName][index] = updated;
      saveData(data);
      return sendJson(res, 200, updated);
    }

    if (req.method === 'DELETE' && id) {
      const index = data[collectionName].findIndex((item) => item.id === id);
      if (index === -1) return sendJson(res, 404, { detail: 'não encontrado' });
      data[collectionName].splice(index, 1);
      saveData(data);
      res.writeHead(204);
      return res.end();
    }

    return sendJson(res, 405, { detail: 'método não suportado' });
  } catch (err) {
    return sendJson(res, 400, { detail: err.message });
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function serveStatic(req, res, pathname) {
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(STATIC_DIR, safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end('não encontrado');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Activity Manager rodando em http://localhost:${PORT}`);
  console.log(`Dados salvos em ${DATA_FILE}`);
  if (!fs.existsSync(STATIC_DIR)) {
    console.log(`Aviso: ${STATIC_DIR} não existe ainda — rode "npm run build" antes de abrir a página.`);
  }
});
