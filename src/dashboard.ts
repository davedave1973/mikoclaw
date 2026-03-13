/**
 * MikoClaw Web Dashboard
 * Local monitoring UI — shows live logs and chat history
 * Run: npx tsx src/dashboard.ts
 */
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const PORT = 3333;
const PROJECT_DIR = path.resolve(import.meta.dirname, '..');
const DB_PATH = path.join(PROJECT_DIR, 'store', 'messages.db');
const LOG_DIR = path.join(PROJECT_DIR, 'groups', 'telegram_main', 'logs');

// SSE clients for live logs
const sseClients: Set<import('http').ServerResponse> = new Set();

// Watch for new log files
let lastLogContent = '';
function tailLogs() {
  try {
    if (!fs.existsSync(LOG_DIR)) return;
    const files = fs
      .readdirSync(LOG_DIR)
      .filter((f) => f.endsWith('.log'))
      .sort();
    if (files.length === 0) return;
    const latest = path.join(LOG_DIR, files[files.length - 1]);
    const content = fs.readFileSync(latest, 'utf-8');
    if (content !== lastLogContent) {
      lastLogContent = content;
      for (const client of sseClients) {
        client.write(
          `data: ${JSON.stringify({ type: 'log', content: content.slice(-2000) })}\n\n`,
        );
      }
    }
  } catch {
    /* ignore */
  }
}
setInterval(tailLogs, 2000);

function getMessages(limit = 50): any[] {
  try {
    if (!fs.existsSync(DB_PATH)) return [];
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db
      .prepare(
        `
      SELECT id, chat_jid, sender_name, content, timestamp, is_from_me 
      FROM messages ORDER BY timestamp DESC LIMIT ?
    `,
      )
      .all(limit);
    db.close();
    return (rows as any[]).reverse();
  } catch {
    return [];
  }
}

function getGroups(): any[] {
  try {
    if (!fs.existsSync(DB_PATH)) return [];
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(`SELECT * FROM registered_groups`).all();
    db.close();
    return rows as any[];
  } catch {
    return [];
  }
}

function getRecentLogs(): string[] {
  try {
    if (!fs.existsSync(LOG_DIR)) return [];
    return fs
      .readdirSync(LOG_DIR)
      .filter((f) => f.endsWith('.log'))
      .sort()
      .slice(-10);
  } catch {
    return [];
  }
}

function getLogContent(filename: string): string {
  try {
    const safe = path.basename(filename);
    const full = path.join(LOG_DIR, safe);
    if (!fs.existsSync(full)) return 'File not found';
    return fs.readFileSync(full, 'utf-8');
  } catch {
    return 'Error reading log';
  }
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MikoClaw Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: #0a0a0f; --surface: #12121a; --surface2: #1a1a2e; 
    --border: #2a2a3e; --text: #e0e0f0; --text2: #8888aa;
    --accent: #7c3aed; --accent2: #a855f7; --green: #22c55e;
    --red: #ef4444; --blue: #3b82f6;
  }
  body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  
  .header { 
    background: linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%);
    border-bottom: 1px solid var(--border); padding: 20px 32px;
    display: flex; align-items: center; gap: 16px;
  }
  .header h1 { font-size: 24px; font-weight: 700; }
  .header h1 span { color: var(--accent2); }
  .status-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--green); 
    animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .status-text { color: var(--green); font-size: 13px; font-weight: 500; }

  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
  
  .card { 
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    overflow: hidden;
  }
  .card-header { 
    padding: 16px 20px; border-bottom: 1px solid var(--border);
    font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--text2);
  }
  .card-body { padding: 16px 20px; max-height: 500px; overflow-y: auto; }
  .card-full { grid-column: 1 / -1; }

  .msg { padding: 10px 0; border-bottom: 1px solid var(--border); }
  .msg:last-child { border-bottom: none; }
  .msg-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .msg-sender { font-weight: 600; font-size: 13px; color: var(--accent2); }
  .msg-time { font-size: 11px; color: var(--text2); }
  .msg-content { font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .msg-bot .msg-sender { color: var(--green); }
  .msg-bot .msg-content { color: var(--text2); }

  .log-entry { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; 
    line-height: 1.6; white-space: pre-wrap; color: var(--text2); word-break: break-all; }
  
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .stat { text-align: center; padding: 16px; background: var(--surface2); border-radius: 8px; }
  .stat-value { font-size: 28px; font-weight: 700; color: var(--accent2); }
  .stat-label { font-size: 11px; color: var(--text2); margin-top: 4px; text-transform: uppercase; }

  .log-files { list-style: none; }
  .log-files li { padding: 8px 0; border-bottom: 1px solid var(--border); }
  .log-files a { color: var(--blue); text-decoration: none; font-size: 13px; font-family: monospace; }
  .log-files a:hover { text-decoration: underline; }

  .refresh-btn { 
    background: var(--accent); color: white; border: none; padding: 8px 16px;
    border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;
    transition: background 0.2s;
  }
  .refresh-btn:hover { background: var(--accent2); }
</style>
</head>
<body>
  <div class="header">
    <div class="status-dot"></div>
    <h1>Miko<span>Claw</span></h1>
    <span class="status-text">RUNNING</span>
    <div style="flex:1"></div>
    <button class="refresh-btn" onclick="location.reload()">↻ Refresh</button>
  </div>
  <div class="container">
    <div class="stat-grid" id="stats"></div>
    <br>
    <div class="grid">
      <div class="card card-full">
        <div class="card-header">💬 Recent Messages</div>
        <div class="card-body" id="messages"></div>
      </div>
      <div class="card">
        <div class="card-header">📡 Live Log</div>
        <div class="card-body" id="livelog"><div class="log-entry">Waiting for activity...</div></div>
      </div>
      <div class="card">
        <div class="card-header">📁 Log Files</div>
        <div class="card-body" id="logfiles"></div>
      </div>
    </div>
  </div>
  <script>
    async function load() {
      const [msgs, groups, logs] = await Promise.all([
        fetch('/api/messages').then(r=>r.json()),
        fetch('/api/groups').then(r=>r.json()),
        fetch('/api/logs').then(r=>r.json()),
      ]);
      
      document.getElementById('stats').innerHTML = 
        '<div class="stat"><div class="stat-value">'+msgs.length+'</div><div class="stat-label">Messages</div></div>' +
        '<div class="stat"><div class="stat-value">'+groups.length+'</div><div class="stat-label">Groups</div></div>' +
        '<div class="stat"><div class="stat-value">'+logs.length+'</div><div class="stat-label">Log Files</div></div>';

      document.getElementById('messages').innerHTML = msgs.length ? msgs.map(m =>
        '<div class="msg '+(m.is_from_me?'msg-bot':'')+'">' +
        '<div class="msg-header"><span class="msg-sender">'+(m.is_from_me?'🤖 WizDudeBot':m.sender_name)+'</span>' +
        '<span class="msg-time">'+new Date(m.timestamp).toLocaleString()+'</span></div>' +
        '<div class="msg-content">'+escHtml(m.content)+'</div></div>'
      ).join('') : '<div style="color:var(--text2)">No messages yet</div>';

      document.getElementById('logfiles').innerHTML = '<ul class="log-files">' +
        logs.map(f => '<li><a href="/api/log/'+f+'" target="_blank">'+f+'</a></li>').join('') +
        '</ul>';
    }
    function escHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
    load();

    // SSE for live logs
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'log') {
        document.getElementById('livelog').innerHTML = '<div class="log-entry">'+escHtml(data.content)+'</div>';
      }
    };
  </script>
</body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (url.pathname === '/' || url.pathname === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
  } else if (url.pathname === '/api/messages') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getMessages()));
  } else if (url.pathname === '/api/groups') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getGroups()));
  } else if (url.pathname === '/api/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getRecentLogs()));
  } else if (url.pathname.startsWith('/api/log/')) {
    const filename = url.pathname.slice('/api/log/'.length);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(getLogContent(filename));
  } else if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  } else if (url.pathname === '/api/send' && req.method === 'POST') {
    // 2-way comms: Antigravity -> WizDudeBot
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const queueDir = path.join(PROJECT_DIR, 'data', 'antigrav-queue');
        fs.mkdirSync(queueDir, { recursive: true });
        const filename = `${Date.now()}.json`;
        fs.writeFileSync(path.join(queueDir, filename), JSON.stringify({
          from: 'antigravity',
          message: body.message,
          timestamp: new Date().toISOString(),
          chatJid: body.chatJid || 'tg:8146835535',
        }));
        // Also write to the IPC input for the current container if running
        const ipcDir = path.join(PROJECT_DIR, 'data', 'ipc', 'telegram_main', 'input');
        if (fs.existsSync(ipcDir)) {
          fs.writeFileSync(
            path.join(ipcDir, `${Date.now()}.json`),
            JSON.stringify({ type: 'message', text: body.message }),
          );
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, queued: filename }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
  } else if (url.pathname === '/api/inbox') {
    // 2-way comms: WizDudeBot -> Antigravity (read recent bot responses)
    try {
      if (!fs.existsSync(DB_PATH)) { res.writeHead(200); res.end('[]'); return; }
      const db = new Database(DB_PATH, { readonly: true });
      const limit = parseInt(url.searchParams.get('limit') || '10');
      const rows = db.prepare(`
        SELECT content, timestamp, sender_name FROM messages
        WHERE is_from_me = 1 ORDER BY timestamp DESC LIMIT ?
      `).all(limit);
      db.close();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify((rows as any[]).reverse()));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
  } else if (url.pathname === '/api/model') {
    // Check or set model
    if (req.method === 'GET') {
      try {
        const chatJid = url.searchParams.get('jid') || 'tg:8146835535';
        if (!fs.existsSync(DB_PATH)) { res.writeHead(200); res.end('{}'); return; }
        const db = new Database(DB_PATH, { readonly: true });
        const row = db.prepare('SELECT value FROM router_state WHERE key = ?').get(`model:${chatJid}`) as any;
        db.close();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ model: row?.value || 'deepseek/deepseek-chat-v3-0324' }));
      } catch { res.writeHead(200); res.end('{}'); }
    } else if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          const chatJid = body.chatJid || 'tg:8146835535';
          const db = new Database(DB_PATH);
          db.prepare('INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)').run(`model:${chatJid}`, body.model);
          db.close();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, model: body.model }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    }
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n🖥️  MikoClaw Dashboard: http://localhost:${PORT}\n`);
});
