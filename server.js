'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const express = require('express');
const { WebSocketServer } = require('ws');
const pty = require('@lydell/node-pty');

// optional config.json: { "port": 7070, "host": "", "token": "..." }
let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch {}

const PORT = parseInt(cfg.port || process.env.PORT || '7070', 10);
const HOST = cfg.host || process.env.TERMBRIDGE_HOST || ''; // '' = tailscale + loopback, 'all' = 0.0.0.0
const TOKEN = cfg.token || process.env.TERMBRIDGE_TOKEN || '';

// mirror console output to logs/termbridge.log (for hidden autostart runs)
try {
  const logDir = path.join(__dirname, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logStream = fs.createWriteStream(path.join(logDir, 'termbridge.log'), { flags: 'a' });
  for (const level of ['log', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      try {
        logStream.write(`${new Date().toISOString()} ${args.join(' ')}\n`);
      } catch {}
    };
  }
} catch {}

process.on('uncaughtException', (err) => console.error('[termbridge] uncaughtException:', err.stack || err));
process.on('unhandledRejection', (err) => console.error('[termbridge] unhandledRejection:', (err && err.stack) || err));

/** CSI 3 J — erase scrollback; what `cls` / `clear` end with */
const CLEAR_SCROLLBACK = '\x1b[3J';
const BUFFER_MAX = 400_000;
const BUFFER_KEEP = 300_000;
const OUTPUT_BATCH_MS = 8;
const OUTPUT_BATCH_MAX = 16 * 1024;

// ---------------------------------------------------------------- shells

function firstExisting(paths) {
  for (const p of paths) if (p && fs.existsSync(p)) return p;
  return null;
}

const windir = process.env.windir || 'C:\\Windows';
const SHELL_DEFS = [
  {
    key: 'powershell',
    label: 'PowerShell',
    path: firstExisting([path.join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')]),
    args: ['-NoLogo'],
  },
  {
    key: 'pwsh',
    label: 'PowerShell 7',
    path: firstExisting([
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'pwsh.exe'),
    ]),
    args: ['-NoLogo'],
  },
  {
    key: 'cmd',
    label: 'Command Prompt',
    path: firstExisting([path.join(windir, 'System32', 'cmd.exe')]),
    args: [],
  },
  {
    key: 'gitbash',
    label: 'Git Bash',
    path: firstExisting([
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ]),
    args: ['--login', '-i'],
  },
];

const SHELLS = new Map(SHELL_DEFS.filter((s) => s.path).map((s) => [s.key, s]));
const DEFAULT_SHELL = SHELLS.has('pwsh') ? 'pwsh' : SHELLS.has('powershell') ? 'powershell' : [...SHELLS.keys()][0];

// ---------------------------------------------------------------- state

/** @type {Map<string, Term>} */
const terminals = new Map();
/** @type {Map<import('ws').WebSocket, Client>} */
const clients = new Map();
let termSeq = 0;
let clientSeq = 0;

class Term {
  /** launch (optional): { file, args, cwd, name, shell, unroll, cleanupFile } — e.g. run a .bat in cmd */
  constructor(shellKey, launch) {
    this.id = 't' + ++termSeq;
    let file, args, cwd;
    if (launch) {
      this.shell = launch.shell || 'cmd';
      this.name = launch.name;
      this.custom = true; // keep the launched file's name on the tab
      this.unroll = !!launch.unroll;
      this.cleanupFile = launch.cleanupFile || null;
      this._scanBuf = '';
      file = launch.file;
      args = launch.args;
      cwd = launch.cwd;
    } else {
      const shell = SHELLS.get(shellKey) || SHELLS.get(DEFAULT_SHELL);
      this.shell = shell.key;
      this.name = shell.label;
      this.custom = false; // true once a user renames the tab
      file = shell.path;
      args = shell.args;
      cwd = os.homedir();
    }
    this.cols = 80;
    this.rows = 24;
    /** Replay log for clients that join or reconnect: pty output split into
        segments, each tagged with the terminal size that was in effect while
        it was produced. ConPTY answers a resize by repainting the whole
        screen, and that repaint only lands in place at the size it was drawn
        for — replayed into a differently sized terminal it scrolls the old
        screen into the scrollback instead of overwriting it, which is what
        left duplicated screens and walls of blank padding behind. */
    this.segments = [{ cols: this.cols, rows: this.rows, data: '' }];
    this.bufferLen = 0;
    this._recTail = '';
    this._outputPending = '';
    this._outputTimer = null;
    /** per-client viewport sizes; effective size = min over viewers */
    this.sizes = new Map();
    this.proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: this.cols,
      rows: this.rows,
      cwd,
      env: process.env,
      useConpty: true,
    });
    this.proc.onData((data) => {
      this.record(data);
      if (this.unroll) this.scanForStarts(data);
      this.queueOutput(data);
    });
    this.proc.onExit(({ exitCode }) => {
      this.flushOutput();
      terminals.delete(this.id);
      if (this.cleanupFile) {
        setTimeout(() => fs.unlink(this.cleanupFile, () => {}), 2000);
      }
      broadcast({ type: 'exit', id: this.id, exitCode });
    });
  }

  summary(withBuffer) {
    const s = { id: this.id, name: this.name, shell: this.shell, custom: this.custom, cols: this.cols, rows: this.rows };
    if (withBuffer) s.replay = this.segments.filter((seg) => seg.data);
    return s;
  }

  /** Append pty output to the replay log. `cls` / `clear` end with CSI 3 J,
      which erases the scrollback — drop everything before it here too, or the
      cleared history comes back in full the next time a client reconnects. */
  record(data) {
    // the sequence can straddle a chunk boundary, so search it together with
    // the tail of the previous chunk — those bytes are dropped along with the
    // rest of the log when the match turns out to start inside them
    const joined = this._recTail + data;
    const cut = joined.lastIndexOf(CLEAR_SCROLLBACK);
    if (cut > -1) {
      this.segments = [{ cols: this.cols, rows: this.rows, data: '' }];
      this.bufferLen = 0;
      data = joined.slice(cut);
    }
    this._recTail = data.slice(1 - CLEAR_SCROLLBACK.length);
    this.segments[this.segments.length - 1].data += data;
    this.bufferLen += data.length;
    if (this.bufferLen > BUFFER_MAX) this.trimBuffer();
  }

  /** cap the replay log at BUFFER_KEEP, dropping the oldest segments first */
  trimBuffer() {
    while (this.segments.length > 1
        && this.bufferLen - this.segments[0].data.length >= BUFFER_KEEP) {
      this.bufferLen -= this.segments[0].data.length;
      this.segments.shift();
    }
    if (this.bufferLen <= BUFFER_KEEP) return;
    const first = this.segments[0];
    let cut = Math.min(this.bufferLen - BUFFER_KEEP, first.data.length);
    // resume on a line boundary so a half escape sequence never leads a replay
    const nl = first.data.indexOf('\n', cut);
    if (nl > -1 && nl - cut < 4000) cut = nl + 1;
    first.data = first.data.slice(cut);
    this.bufferLen -= cut;
  }

  // PTYs often emit output a few bytes at a time. A very short batch removes
  // redundant WebSocket frames and browser renders without perceptible input
  // delay; large output is sent immediately.
  queueOutput(data) {
    this._outputPending += data;
    if (this._outputPending.length >= OUTPUT_BATCH_MAX) {
      this.flushOutput();
      return;
    }
    if (this._outputTimer) return;
    this._outputTimer = setTimeout(() => this.flushOutput(), OUTPUT_BATCH_MS);
  }

  flushOutput() {
    if (this._outputTimer) {
      clearTimeout(this._outputTimer);
      this._outputTimer = null;
    }
    const data = this._outputPending;
    this._outputPending = '';
    if (data) broadcast({ type: 'output', id: this.id, data });
  }

  setClientSize(clientId, cols, rows) {
    this.sizes.set(clientId, { cols, rows });
    this.applyEffectiveSize();
  }

  dropClient(clientId) {
    if (this.sizes.delete(clientId)) this.applyEffectiveSize();
  }

  /** watch the output of an unrolled .bat for ##TS-START## lines (echoed in place
      of `start` commands, so cmd has already expanded any %VARS%) */
  scanForStarts(data) {
    this._scanBuf += data;
    if (this._scanBuf.length > 16_000) this._scanBuf = this._scanBuf.slice(-8_000);
    const lines = this._scanBuf.split('\n');
    this._scanBuf = lines.pop();
    for (let line of lines) {
      line = line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').replace(/\r/g, '');
      const i = line.indexOf('##TS-START##');
      if (i === -1) continue;
      try {
        handleStartLine(line.slice(i + '##TS-START##'.length).trim(), this);
      } catch (e) {
        console.error('[termbridge] could not parse the start line:', e.message);
      }
    }
  }

  applyEffectiveSize() {
    if (this.sizes.size === 0) return;
    let cols = Infinity;
    let rows = Infinity;
    for (const s of this.sizes.values()) {
      cols = Math.min(cols, s.cols);
      rows = Math.min(rows, s.rows);
    }
    cols = Math.max(2, Math.min(500, cols));
    rows = Math.max(2, Math.min(200, rows));
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    // Start a new replay segment before the resize, so ConPTY's full-screen
    // repaint is stored against the size it is about to be drawn for.
    const last = this.segments[this.segments.length - 1];
    if (last.data === '') {
      last.cols = cols;
      last.rows = rows;
    } else {
      this.segments.push({ cols, rows, data: '' });
    }
    try {
      this.proc.resize(cols, rows);
    } catch {}
    broadcast({ type: 'resize', id: this.id, cols, rows });
  }
}

/** tokenize a cmd-style argument string, honoring double quotes */
function tokenize(s) {
  return (s.match(/"[^"]*"|\S+/g) || []).map((t) => t.replace(/^"|"$/g, ''));
}

/** a `start` line captured from an unrolled .bat: open it as a web terminal tab
    (console commands), or tell clients to open it in their browser (URLs) */
function handleStartLine(rest, parentTerm) {
  let title = '';
  let dir = '';
  const m = rest.match(/^"([^"]*)"\s*/);
  if (m) {
    title = m[1];
    rest = rest.slice(m[0].length);
  }
  // consume flags like /D "dir", /MIN, /WAIT, /B
  for (;;) {
    const fd = rest.match(/^\/[Dd]\s+("([^"]*)"|\S+)\s*/);
    if (fd) {
      dir = fd[2] !== undefined ? fd[2] : fd[1];
      rest = rest.slice(fd[0].length);
      continue;
    }
    const ff = rest.match(/^\/\w+\s*/);
    if (ff && !/^\/[Dd]\s/.test(ff[0])) {
      rest = rest.slice(ff[0].length);
      continue;
    }
    break;
  }
  rest = rest.trim();
  if (!rest) return;
  const tokens = tokenize(rest);
  const exe = tokens[0] || '';
  if (/^https?:\/\//i.test(exe)) {
    broadcast({ type: 'open-url', url: exe, from: parentTerm.name });
    return;
  }
  if (terminals.size >= 24) return;
  const term = new Term(null, {
    file: exe,
    args: tokens.slice(1),
    cwd: dir && fs.existsSync(dir) ? dir : os.homedir(),
    name: title || path.win32.basename(exe),
    shell: 'cmd',
  });
  terminals.set(term.id, term);
  broadcast({ type: 'created', term: term.summary(false) });
}

// ---------------------------------------------------------------- ws protocol

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg) {
  const raw = JSON.stringify(msg);
  for (const [ws, c] of clients) {
    if (c.ready && ws.readyState === ws.OPEN) ws.send(raw);
  }
}

function broadcastExcept(exceptWs, msg) {
  const raw = JSON.stringify(msg);
  for (const [ws, c] of clients) {
    if (ws !== exceptWs && c.ready && ws.readyState === ws.OPEN) ws.send(raw);
  }
}

// ---- shared in-app clipboard (not persisted; synced to all clients)

let clipText = '';

// ---- shared memo (persisted to memo.txt, synced to all clients)

const MEMO_FILE = path.join(__dirname, 'memo.txt');
let memo = '';
try {
  memo = fs.readFileSync(MEMO_FILE, 'utf8');
} catch {}
let memoSaveTimer = null;

function setMemo(content) {
  memo = String(content).slice(0, 200_000);
  clearTimeout(memoSaveTimer);
  memoSaveTimer = setTimeout(() => {
    fs.writeFile(MEMO_FILE, memo, (err) => {
      if (err) console.error('[termbridge] could not save the shared note:', err.message);
    });
  }, 800);
}

function presenceList() {
  return [...clients.values()]
    .filter((c) => c.ready)
    .map((c) => ({ id: c.id, label: c.label, kind: c.kind }));
}

function broadcastPresence() {
  broadcast({ type: 'presence', clients: presenceList() });
}

function tokenOk(given) {
  if (!TOKEN) return true;
  if (typeof given !== 'string') return false;
  const a = Buffer.from(TOKEN);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// newest mtime of the client assets — clients reload when this changes across reconnects
const ASSET_VER = (() => {
  let v = 0;
  try {
    for (const f of fs.readdirSync(path.join(__dirname, 'public'))) {
      const st = fs.statSync(path.join(__dirname, 'public', f));
      if (st.isFile()) v = Math.max(v, Math.round(st.mtimeMs));
    }
  } catch {}
  return v || Date.now();
})();

const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });

wss.on('connection', (ws) => {
  const client = { id: 'c' + ++clientSeq, label: 'Unknown device', kind: 'desktop', ready: false };
  clients.set(ws, client);
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'hello') {
      if (!tokenOk(msg.token)) {
        send(ws, { type: 'auth-error' });
        ws.close(4001, 'bad token');
        return;
      }
      // Flush output that was already folded into a terminal's replay log
      // before this client receives its snapshot, preventing duplicate text.
      for (const term of terminals.values()) term.flushOutput();
      client.ready = true;
      if (typeof msg.label === 'string') client.label = msg.label.slice(0, 60);
      if (msg.kind === 'mobile') client.kind = 'mobile';
      send(ws, {
        type: 'init',
        hostname: os.hostname(),
        // The address other devices actually use. Since the app only listens on
        // loopback, the tailnet IP is no longer somewhere you can open it.
        serveUrl: SERVE_URL,
        tsIp: TS_IP,
        shells: [...SHELLS.values()].map((s) => ({ key: s.key, label: s.label })),
        defaultShell: DEFAULT_SHELL,
        terminals: [...terminals.values()].map((t) => t.summary(true)),
        clients: presenceList(),
        memo,
        clip: clipText,
        home: os.homedir(),
        wallpaper: wallpaperState(),
        assetVer: ASSET_VER,
      });
      broadcastPresence();
      return;
    }

    if (!client.ready) return;

    switch (msg.type) {
      case 'create': {
        if (terminals.size >= 24) return;
        const term = new Term(typeof msg.shell === 'string' ? msg.shell : DEFAULT_SHELL);
        terminals.set(term.id, term);
        broadcast({ type: 'created', term: term.summary(false), by: client.id });
        break;
      }
      case 'input': {
        const t = terminals.get(msg.id);
        if (t && typeof msg.data === 'string') t.proc.write(msg.data);
        break;
      }
      case 'resize': {
        const t = terminals.get(msg.id);
        const cols = msg.cols | 0;
        const rows = msg.rows | 0;
        if (t && cols > 1 && rows > 1) t.setClientSize(client.id, cols, rows);
        break;
      }
      case 'unview': {
        const t = terminals.get(msg.id);
        if (t) t.dropClient(client.id);
        break;
      }
      // tab order is shared like the tabs themselves, so a reorder on one
      // device shows up on the others and survives a reconnect
      case 'reorder': {
        if (!Array.isArray(msg.ids)) break;
        const next = new Map();
        for (const id of msg.ids) {
          const t = terminals.get(id);
          if (t) next.set(id, t);
        }
        // anything the client had not seen yet keeps its place at the end
        for (const [id, t] of terminals) next.set(id, t);
        terminals.clear();
        for (const [id, t] of next) terminals.set(id, t);
        broadcast({ type: 'order', ids: [...terminals.keys()] });
        break;
      }
      case 'rename': {
        const t = terminals.get(msg.id);
        if (t && typeof msg.name === 'string' && msg.name.trim()) {
          t.name = msg.name.trim().slice(0, 60);
          t.custom = true;
          broadcast({ type: 'renamed', id: t.id, name: t.name });
        }
        break;
      }
      case 'memo-set': {
        if (typeof msg.content === 'string') {
          setMemo(msg.content);
          broadcastExcept(ws, { type: 'memo', content: memo });
        }
        break;
      }
      case 'clip': {
        if (typeof msg.text === 'string') {
          clipText = msg.text.slice(0, 100_000);
          broadcastExcept(ws, { type: 'clip', text: clipText });
        }
        break;
      }
      case 'kill': {
        const t = terminals.get(msg.id);
        if (t) {
          try {
            t.proc.kill();
          } catch {}
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    for (const t of terminals.values()) t.dropClient(client.id);
    if (client.ready) broadcastPresence();
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000).unref();

// ---------------------------------------------------------------- http

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------- file explorer API

function fsAuth(req, res, next) {
  if (!TOKEN || tokenOk(req.headers['x-termbridge-token'] || '')) return next();
  res.status(401).json({ error: 'err.auth' });
}

const WIN_ABS = /^[A-Za-z]:\\/;
const BAD_NAME = /[\\/:*?"<>|\x00-\x1f]/;

function normPath(p) {
  if (typeof p !== 'string' || !p) return null;
  p = path.win32.normalize(p);
  return WIN_ABS.test(p) ? p : null;
}

// Names that land on disk follow the caller's UI language (x-lang header).
const DISK_NAMES = {
  ja: { copy: 'コピー', shortcut: 'ショートカット', newFolder: '新しいフォルダー', newFile: '新しいテキスト ドキュメント' },
  en: { copy: 'Copy', shortcut: 'Shortcut', newFolder: 'New folder', newFile: 'New Text Document' },
};
const langOf = (req) => (DISK_NAMES[req.get('x-lang')] ? req.get('x-lang') : 'en');
const diskName = (req, key) => DISK_NAMES[langOf(req)][key];

function freshName(dir, base, ext) {
  let name = base + ext;
  let i = 2;
  while (fs.existsSync(path.win32.join(dir, name))) name = `${base} (${i++})${ext}`;
  return name;
}

function copyName(dir, name, lang) {
  if (!fs.existsSync(path.win32.join(dir, name))) return name;
  const ext = path.win32.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let cand = `${base} - ${DISK_NAMES[lang].copy}${ext}`;
  let i = 2;
  while (fs.existsSync(path.win32.join(dir, cand))) cand = `${base} - ${DISK_NAMES[lang].copy} (${i++})${ext}`;
  return cand;
}

// Node's Dirent API does not expose the Windows Hidden/System attributes.
// ATTRIB is a small native Windows utility and is much quicker to start than
// PowerShell, which keeps folder navigation responsive on mobile.
const hiddenEntryCache = new Map();
const HIDDEN_CACHE_MS = 3_000;

function hiddenEntryNames(dir) {
  const cached = hiddenEntryCache.get(dir);
  if (cached && Date.now() - cached.at < HIDDEN_CACHE_MS) return Promise.resolve(cached.names);
  return new Promise((resolve) => {
    execFile('attrib.exe', [path.win32.join(dir, '*'), '/D'],
      { windowsHide: true, maxBuffer: 2 * 1024 * 1024 }, (err, out) => {
        const names = new Set();
        for (const line of String(out || '').split(/\r?\n/)) {
          const pathAt = line.search(/[A-Za-z]:\\/);
          if (pathAt <= 0 || !/[HS]/i.test(line.slice(0, pathAt))) continue;
          names.add(path.win32.basename(line.slice(pathAt).trim()).toLowerCase());
        }
        hiddenEntryCache.set(dir, { at: Date.now(), names });
        resolve(names);
      });
  });
}

async function mapWithConcurrency(items, limit, mapItem) {
  const result = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      result[index] = await mapItem(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return result;
}

app.get('/api/fs/list', fsAuth, async (req, res) => {
  const q = String(req.query.path || '');
  if (!q) {
    // drive list ("PC" view)
    const entries = [];
    for (let c = 67; c <= 90; c++) {
      const d = String.fromCharCode(c) + ':\\';
      if (fs.existsSync(d)) entries.push({ name: d, dir: true, drive: true, size: 0, mtime: 0 });
    }
    return res.json({ path: '', parent: null, entries });
  }
  const p = normPath(q);
  if (!p) return res.status(400).json({ error: 'err.badPath' });
  try {
    let dirents = await fs.promises.readdir(p, { withFileTypes: true });
    if (req.query.showHidden !== '1') {
      const hidden = await hiddenEntryNames(p);
      if (hidden.size) dirents = dirents.filter((d) => !hidden.has(d.name.toLowerCase()));
    }
    const doStat = dirents.length <= 800; // skip per-entry stat in huge folders
    // Keep the filesystem worker queue bounded. Starting hundreds of stats at
    // once can stall other file operations and temporarily inflate memory.
    const entries = await mapWithConcurrency(dirents, 32, async (d) => {
      const dir = d.isDirectory();
      let size = 0;
      let mtime = 0;
      if (doStat) {
        try {
          const st = await fs.promises.stat(path.win32.join(p, d.name));
          size = st.size;
          mtime = st.mtimeMs;
        } catch {}
      }
      return { name: d.name, dir, size: dir ? 0 : size, mtime };
    });
    const parent = path.win32.dirname(p);
    res.json({ path: p, parent: parent === p ? '' : parent, entries });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/fs/mkdir', fsAuth, async (req, res) => {
  const p = normPath(req.body.dir);
  if (!p) return res.status(400).json({ error: 'err.badPath' });
  try {
    const name = freshName(p, diskName(req, 'newFolder'), '');
    await fs.promises.mkdir(path.win32.join(p, name));
    res.json({ name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/fs/newfile', fsAuth, async (req, res) => {
  const p = normPath(req.body.dir);
  if (!p) return res.status(400).json({ error: 'err.badPath' });
  try {
    const name = freshName(p, diskName(req, 'newFile'), '.txt');
    await fs.promises.writeFile(path.win32.join(p, name), '', { flag: 'wx' });
    res.json({ name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/fs/rename', fsAuth, async (req, res) => {
  const p = normPath(req.body.path);
  const name = String(req.body.name || '').trim();
  if (!p || !name || name.length > 200 || BAD_NAME.test(name)) {
    return res.status(400).json({ error: 'err.badName' });
  }
  const dest = path.win32.join(path.win32.dirname(p), name);
  const caseOnly = dest.toLowerCase() === p.toLowerCase();
  if (!caseOnly && fs.existsSync(dest)) return res.status(409).json({ error: 'err.exists' });
  try {
    await fs.promises.rename(p, dest);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Explorer-style delete: send to the Recycle Bin (never a hard delete)
app.post('/api/fs/delete', fsAuth, (req, res) => {
  const p = normPath(req.body.path);
  if (!p || !fs.existsSync(p)) return res.status(400).json({ error: 'err.notFound' });
  const method = fs.statSync(p).isDirectory() ? 'DeleteDirectory' : 'DeleteFile';
  const script = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${method}('${p.replace(/'/g, "''")}', 'OnlyErrorDialogs', 'SendToRecycleBin')`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (err, _out, serr) => {
    if (err) res.status(500).json({ error: (serr || err.message).trim().split('\n')[0] });
    else res.json({ ok: true });
  });
});

app.post('/api/fs/copy', fsAuth, async (req, res) => {
  const src = normPath(req.body.path);
  const destDir = normPath(req.body.dest);
  if (!src || !destDir || !fs.existsSync(src)) return res.status(400).json({ error: 'err.badPath' });
  if ((destDir + '\\').toLowerCase().startsWith(src.toLowerCase() + '\\')) {
    return res.status(400).json({ error: 'err.copyIntoSelf' });
  }
  try {
    const name = copyName(destDir, path.win32.basename(src), langOf(req));
    await fs.promises.cp(src, path.win32.join(destDir, name), { recursive: true });
    res.json({ name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/fs/move', fsAuth, async (req, res) => {
  const src = normPath(req.body.path);
  const destDir = normPath(req.body.dest);
  if (!src || !destDir || !fs.existsSync(src)) return res.status(400).json({ error: 'err.badPath' });
  const name = path.win32.basename(src);
  const dest = path.win32.join(destDir, name);
  if (dest.toLowerCase() === src.toLowerCase()) return res.json({ name });
  if ((destDir + '\\').toLowerCase().startsWith(src.toLowerCase() + '\\')) {
    return res.status(400).json({ error: 'err.moveIntoSelf' });
  }
  if (fs.existsSync(dest)) return res.status(409).json({ error: 'err.destExists' });
  try {
    await fs.promises.rename(src, dest);
  } catch (e) {
    if (e.code === 'EXDEV') {
      // cross-drive move: copy then remove the original
      try {
        await fs.promises.cp(src, dest, { recursive: true });
        await fs.promises.rm(src, { recursive: true });
      } catch (e2) {
        return res.status(500).json({ error: e2.message });
      }
    } else {
      return res.status(500).json({ error: e.message });
    }
  }
  res.json({ name });
});

// resolve a .lnk shortcut via the shell COM object
function resolveLnk(p) {
  return new Promise((resolve, reject) => {
    const script =
      `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ` +
      `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${p.replace(/'/g, "''")}'); ` +
      `ConvertTo-Json @{ target=$s.TargetPath; args=$s.Arguments; cwd=$s.WorkingDirectory }`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (err, out) => {
      if (err) return reject(new Error('err.lnkResolve'));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error('err.lnkResolve'));
      }
    });
  });
}

// create a .lnk pointing at `target`, through the same shell COM object
function createLnk(dest, target, workDir) {
  return new Promise((resolve, reject) => {
    const q = (s) => s.replace(/'/g, "''");
    const script =
      `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${q(dest)}'); ` +
      `$s.TargetPath='${q(target)}'; ` +
      `$s.WorkingDirectory='${q(workDir)}'; ` +
      `$s.Save()`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (err) => {
      if (err) return reject(new Error('err.lnkCreate'));
      resolve(dest);
    });
  });
}

// right-click -> create a shortcut next to the item (or in another folder)
app.post('/api/fs/shortcut', fsAuth, async (req, res) => {
  const target = normPath(req.body.path);
  if (!target) return res.status(400).json({ error: 'err.badPath' });
  const dir = normPath(req.body.dir) || path.win32.dirname(target);
  if (!fs.existsSync(target)) return res.status(400).json({ error: 'err.notFound' });
  if (!fs.existsSync(dir)) return res.status(400).json({ error: 'err.destDirMissing' });
  try {
    const isDir = fs.statSync(target).isDirectory();
    const base = path.win32.basename(target).replace(/\.lnk$/i, '');
    const name = freshName(dir, `${base} - ${diskName(req, 'shortcut')}`, '.lnk');
    await createLnk(path.win32.join(dir, name), target, isDir ? target : path.win32.dirname(target));
    res.json({ name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// double-clicked .bat/.cmd (or a .lnk pointing at one): run it in a new shared terminal tab
app.post('/api/fs/run', fsAuth, async (req, res) => {
  let p = normPath(req.body.path);
  if (!p || !fs.existsSync(p)) return res.status(400).json({ error: 'err.notFound' });
  let cwd = null;
  let argString = '';
  let tabName = path.win32.basename(p);
  if (/\.lnk$/i.test(p)) {
    let info;
    try {
      info = await resolveLnk(p);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
    const target = normPath(info.target || '');
    if (!target || !fs.existsSync(target)) {
      return res.status(400).json({ error: 'err.lnkTargetMissing' });
    }
    if (fs.statSync(target).isDirectory()) return res.json({ navigate: target });
    if (!/\.(bat|cmd)$/i.test(target)) {
      return res.status(400).json({ error: 'err.lnkNotBat' });
    }
    tabName = tabName.replace(/\.lnk$/i, '');
    if (info.cwd && fs.existsSync(info.cwd)) cwd = info.cwd;
    argString = info.args || '';
    p = target;
  } else if (!/\.(bat|cmd)$/i.test(p)) {
    return res.status(400).json({ error: 'err.onlyBat' });
  }
  if (terminals.size >= 24) return res.status(429).json({ error: 'err.maxTerms' });

  // If the bat opens extra console windows via `start`, replace those lines with
  // an echo marker (variables get expanded by cmd itself) and open each one as a
  // web terminal tab instead of a window on the PC's desktop.
  let runPath = p;
  let unroll = false;
  let cleanupFile = null;
  try {
    const raw = fs.readFileSync(p, 'latin1');
    if (/^\s*@?\s*start\s/im.test(raw)) {
      const patched = raw
        .split(/\r?\n/)
        .map((line) => line.replace(/^(\s*@?\s*)start(\s+)/i, '$1echo ##TS-START##$2'))
        .join('\r\n');
      runPath = path.win32.join(path.win32.dirname(p), '~ts~' + path.win32.basename(p));
      fs.writeFileSync(runPath, patched, 'latin1');
      unroll = true;
      cleanupFile = runPath;
    }
  } catch {
    runPath = p; // fall back to running the original
  }

  const argTokens = tokenize(argString);
  const term = new Term(null, {
    file: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
    args: ['/k', runPath, ...argTokens],
    cwd: cwd || path.win32.dirname(p),
    name: tabName,
    shell: 'cmd',
    unroll,
    cleanupFile,
  });
  terminals.set(term.id, term);
  broadcast({ type: 'created', term: term.summary(false) });
  res.json({ termId: term.id, unrolled: unroll });
});

// ---------------------------------------------------------------- pinned files

const PINS_FILE = path.join(__dirname, 'pins.json');
let pins = [];
try {
  pins = JSON.parse(fs.readFileSync(PINS_FILE, 'utf8'));
  if (!Array.isArray(pins)) pins = [];
} catch {}

function savePins() {
  fs.writeFile(PINS_FILE, JSON.stringify(pins, null, 2), () => {});
}

app.get('/api/fs/pins', fsAuth, (req, res) => res.json({ pins }));

app.post('/api/fs/pin', fsAuth, (req, res) => {
  const p = normPath(req.body.path);
  if (!p || !fs.existsSync(p)) return res.status(400).json({ error: 'err.notFound' });
  if (!pins.some((x) => x.path.toLowerCase() === p.toLowerCase())) {
    pins.push({ path: p, dir: fs.statSync(p).isDirectory() });
    savePins();
  }
  res.json({ pins });
});

app.post('/api/fs/unpin', fsAuth, (req, res) => {
  const p = normPath(req.body.path);
  if (!p) return res.status(400).json({ error: 'err.badPath' });
  pins = pins.filter((x) => x.path.toLowerCase() !== p.toLowerCase());
  savePins();
  res.json({ pins });
});

// ---------------------------------------------------------------- wallpaper

const WP_DIR = path.join(__dirname, 'wallpapers');
try {
  fs.mkdirSync(WP_DIR, { recursive: true });
} catch {}

// The directory is created once at startup, but a wallpaper can be set at any
// point after that. If it has gone missing in between the write would fail with
// ENOENT, so make sure it is there first.
function wpEnsureDir() {
  fs.mkdirSync(WP_DIR, { recursive: true });
}

function wpMeta(kind) {
  try {
    return JSON.parse(fs.readFileSync(path.join(WP_DIR, kind + '.json'), 'utf8'));
  } catch {
    return null;
  }
}

const DEFAULT_WALLPAPER_OPACITY = 38;

function wpOpacity(meta) {
  const opacity = Number(meta && meta.opacity);
  return Number.isFinite(opacity) ? Math.max(0, Math.min(100, Math.round(opacity))) : DEFAULT_WALLPAPER_OPACITY;
}

function wallpaperState() {
  const d = wpMeta('desktop');
  const m = wpMeta('mobile');
  const state = (meta) => meta ? { v: meta.v, opacity: wpOpacity(meta) } : null;
  return { desktop: state(d), mobile: state(m) };
}

app.post('/api/wallpaper', fsAuth, express.raw({ type: () => true, limit: '20mb' }), (req, res) => {
  const kind = req.query.kind === 'mobile' ? 'mobile' : 'desktop';
  const mime = req.headers['content-type'] || '';
  if (!/^image\//.test(mime)) return res.status(400).json({ error: 'err.notImage' });
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'err.emptyImage' });
  try {
    const previous = wpMeta(kind);
    wpEnsureDir();
    fs.writeFileSync(path.join(WP_DIR, kind + '.img'), req.body);
    fs.writeFileSync(path.join(WP_DIR, kind + '.json'), JSON.stringify({
      mime,
      v: Date.now(),
      opacity: wpOpacity(previous),
    }));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  broadcast({ type: 'wallpaper', wallpaper: wallpaperState() });
  res.json({ ok: true });
});

app.post('/api/wallpaper/opacity', fsAuth, (req, res) => {
  const kind = req.body.kind === 'mobile' ? 'mobile' : 'desktop';
  const meta = wpMeta(kind);
  const opacity = Number(req.body.opacity);
  if (!meta) return res.status(404).json({ error: 'err.noWallpaper' });
  if (!Number.isFinite(opacity)) return res.status(400).json({ error: 'err.badOpacity' });
  try {
    meta.opacity = Math.max(0, Math.min(100, Math.round(opacity)));
    wpEnsureDir();
    fs.writeFileSync(path.join(WP_DIR, kind + '.json'), JSON.stringify(meta));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  const wallpaper = wallpaperState();
  broadcast({ type: 'wallpaper', wallpaper });
  res.json({ wallpaper });
});

app.post('/api/wallpaper/delete', fsAuth, (req, res) => {
  const kind = req.body.kind === 'mobile' ? 'mobile' : 'desktop';
  try {
    fs.rmSync(path.join(WP_DIR, kind + '.img'), { force: true });
    fs.rmSync(path.join(WP_DIR, kind + '.json'), { force: true });
  } catch {}
  broadcast({ type: 'wallpaper', wallpaper: wallpaperState() });
  res.json({ ok: true });
});

// (no token gate: CSS background-image requests cannot send headers)
app.get('/wallpaper/:kind', (req, res) => {
  const kind = req.params.kind === 'mobile' ? 'mobile' : 'desktop';
  const meta = wpMeta(kind);
  const file = path.join(WP_DIR, kind + '.img');
  if (!meta || !fs.existsSync(file)) return res.status(404).end();
  res.set('Content-Type', meta.mime);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(file);
});

const VENDOR = {
  'xterm.js': '@xterm/xterm/lib/xterm.js',
  'xterm.css': '@xterm/xterm/css/xterm.css',
  'addon-fit.js': '@xterm/addon-fit/lib/addon-fit.js',
  'addon-web-links.js': '@xterm/addon-web-links/lib/addon-web-links.js',
  'addon-unicode11.js': '@xterm/addon-unicode11/lib/addon-unicode11.js',
  'addon-webgl.js': '@xterm/addon-webgl/lib/addon-webgl.js',
};

app.get('/vendor/:file', (req, res) => {
  const rel = VENDOR[req.params.file];
  if (!rel) return res.status(404).end();
  res.sendFile(require.resolve(rel));
});

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------- listen

function tailscaleIp() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const [o1, o2] = a.address.split('.').map(Number);
      if (o1 === 100 && o2 >= 64 && o2 <= 127) return a.address;
    }
  }
  return null;
}

const TS_IP = tailscaleIp();

// `tailscale serve` puts a real certificate in front of the app. That matters for
// more than the padlock: browsers only hand over the OS clipboard in a secure
// context, so pasting into the terminal works over https and not over http.
// Report the URL if serve is already pointing at this port.
let SERVE_URL = null; // filled in at startup, shown in the client's status bar

function tailscaleHttpsUrl(cb) {
  const exe = process.env.TAILSCALE_EXE || 'C:\\Program Files\\Tailscale\\tailscale.exe';
  execFile(exe, ['serve', 'status'], { windowsHide: true, timeout: 4000 }, (err, out) => {
    if (err || !out) return cb(null);
    const url = (out.match(/^https:\/\/\S+/m) || [])[0];
    const here = new RegExp(`http://(127\\.0\\.0\\.1|localhost):${PORT}\\b`).test(out);
    cb(url && here ? url : null);
  });
}

// Nothing is served on a network interface by default. Other devices reach the
// app through `tailscale serve`, which terminates TLS and connects here over
// loopback - so the page is always https, which is what lets the browser hand
// over the OS clipboard. Binding the tailnet address directly would serve the
// same app over plain http, where pasting is broken and the traffic is
// unencrypted inside the tailnet.
//
// `host` is still honoured for anyone fronting this with their own TLS proxy.
let bindHosts;
if (HOST === 'all') bindHosts = ['0.0.0.0'];
else if (HOST) bindHosts = [HOST];
else bindHosts = ['127.0.0.1'];

for (const host of bindHosts) {
  const server = http.createServer(app);
  server.on('upgrade', (req, socket, head) => {
    if ((req.url || '').split('?')[0] !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  server.on('error', (err) => {
    console.error(`[termbridge] cannot listen on ${host}:${PORT}: ${err.message}`);
  });
  server.listen(PORT, host, () => {
    console.log(`[termbridge] http://${host}:${PORT}/`);
  });
}

console.log(`[termbridge] host: ${os.hostname()}  shells: ${[...SHELLS.keys()].join(', ')}  default: ${DEFAULT_SHELL}`);
if (TOKEN) console.log('[termbridge] token auth: enabled');

tailscaleHttpsUrl((url) => {
  SERVE_URL = url;
  if (url) {
    console.log(`[termbridge] ${url}  <- open this on your other devices`);
  } else if (!HOST) {
    console.warn('[termbridge] no https endpoint yet, so only this machine can reach the app.');
    console.warn('[termbridge] run: powershell -ExecutionPolicy Bypass -File scripts\\enable-https.ps1');
  }
});
