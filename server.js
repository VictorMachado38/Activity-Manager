// Servidor local do Activity Manager: sem framework, sem banco — só serve os
// arquivos do build do Angular e persiste tudo num data.json neste diretório.
// Rodar depois de `npm run build`: `npm run server` (ou `node server.js`).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const JIRA_CONFIG_FILE = path.join(__dirname, 'jira-config.json');
const STATIC_DIR = path.join(__dirname, 'dist', 'activity-manager', 'browser');

const EMPTY_STATE = { activities: [], shortcuts: [], credentials: [], messages: [] };

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
    defaults: () => ({
      status: 'a_fazer',
      notes: null,
      parent_id: null,
      jira_key: null,
      jira_status: null,
      jira_issue_type: null,
    }),
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
  messages: {
    defaults: () => ({ html: '', text: '' }),
    onCreate: (record) => ({ ...record, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    onUpdate: (record) => ({ ...record, updated_at: new Date().toISOString() }),
  },
};

function loadJiraConfig() {
  if (!fs.existsSync(JIRA_CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(JIRA_CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

// Tipos que o combo box do front pode pedir em /api/jira/my-items. Allowlist
// exata — o valor entra na JQL, então nada fora daqui é aceito.
const JIRA_MY_ITEMS_TYPES = ['Item de Trabalho', 'Bug'];
const JIRA_MY_ITEMS_DEFAULT_TYPE = 'Item de Trabalho';

function buildMyItemsJql(type) {
  return `type = "${type}" AND assignee = currentUser() ORDER BY created DESC`;
}

const JIRA_ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/i;

async function runJiraSearch(config, jql) {
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  const jiraRes = await fetch(`${config.baseUrl}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jql,
      maxResults: 100,
      fields: ['summary', 'status', 'issuetype', 'created', 'assignee'],
    }),
  });

  const payload = await jiraRes.json();

  if (!jiraRes.ok) {
    const detail =
      Array.isArray(payload.errorMessages) && payload.errorMessages.length
        ? payload.errorMessages.join(', ')
        : 'Erro ao consultar o Jira';
    const error = new Error(detail);
    error.status = jiraRes.status;
    throw error;
  }

  return (payload.issues || []).map((issue) => ({
    key: issue.key,
    url: `${config.baseUrl}/browse/${issue.key}`,
    summary: issue.fields?.summary ?? '',
    status: issue.fields?.status?.name ?? null,
    issueType: issue.fields?.issuetype?.name ?? null,
    created: issue.fields?.created ?? null,
  }));
}

async function handleJiraMyItems(req, res, url) {
  const config = loadJiraConfig();
  if (!config || !config.baseUrl || !config.email || !config.apiToken) {
    return sendJson(res, 500, { detail: 'Credenciais do Jira não configuradas (jira-config.json).' });
  }

  const requested = url.searchParams.get('type');
  const type = requested ? requested : JIRA_MY_ITEMS_DEFAULT_TYPE;
  if (!JIRA_MY_ITEMS_TYPES.includes(type)) {
    return sendJson(res, 400, { detail: `Tipo de item inválido: ${type}` });
  }

  try {
    const issues = await runJiraSearch(config, buildMyItemsJql(type));
    return sendJson(res, 200, { issues });
  } catch (err) {
    return sendJson(res, err.status || 502, { detail: err.message || 'Falha ao conectar com o Jira' });
  }
}

function mapLinkedIssue(config, raw) {
  if (!raw || !raw.key) return null;
  return {
    key: raw.key,
    url: `${config.baseUrl}/browse/${raw.key}`,
    summary: raw.fields?.summary ?? '',
    status: raw.fields?.status?.name ?? null,
    issueType: raw.fields?.issuetype?.name ?? null,
    created: raw.fields?.created ?? null,
  };
}

async function handleJiraChildren(req, res, key) {
  if (!JIRA_ISSUE_KEY_PATTERN.test(key)) {
    return sendJson(res, 400, { detail: 'Chave de item inválida' });
  }

  const config = loadJiraConfig();
  if (!config || !config.baseUrl || !config.email || !config.apiToken) {
    return sendJson(res, 500, { detail: 'Credenciais do Jira não configuradas (jira-config.json).' });
  }

  try {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    const issueRes = await fetch(
      `${config.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,issuetype,subtasks,issuelinks`,
      { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } },
    );
    const issuePayload = await issueRes.json();

    if (!issueRes.ok) {
      const detail =
        Array.isArray(issuePayload.errorMessages) && issuePayload.errorMessages.length
          ? issuePayload.errorMessages.join(', ')
          : 'Erro ao consultar o Jira';
      return sendJson(res, issueRes.status, { detail });
    }

    const byKey = new Map();
    const addIssue = (raw) => {
      const mapped = mapLinkedIssue(config, raw);
      if (mapped && !byKey.has(mapped.key)) byKey.set(mapped.key, mapped);
    };

    for (const sub of issuePayload.fields?.subtasks || []) addIssue(sub);
    for (const link of issuePayload.fields?.issuelinks || []) {
      addIssue(link.outwardIssue);
      addIssue(link.inwardIssue);
    }

    const parentIssues = await runJiraSearch(config, `parent = "${key}" ORDER BY updated DESC`);
    for (const issue of parentIssues) {
      if (!byKey.has(issue.key)) byKey.set(issue.key, issue);
    }

    return sendJson(res, 200, { issues: Array.from(byKey.values()) });
  } catch (err) {
    return sendJson(res, err.status || 502, { detail: err.message || 'Falha ao conectar com o Jira' });
  }
}

async function handleApi(req, res, url) {
  const parts = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);

  if (parts[0] === 'jira' && parts[1] === 'my-items' && req.method === 'GET') {
    return handleJiraMyItems(req, res, url);
  }

  if (parts[0] === 'jira' && parts[1] === 'issue' && parts[3] === 'children' && req.method === 'GET') {
    return handleJiraChildren(req, res, decodeURIComponent(parts[2]));
  }

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
  '.webmanifest': 'application/manifest+json',
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
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': content.length,
    });
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
