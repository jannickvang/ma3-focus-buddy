'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const dgram = require('dgram');
const { execFile } = require('child_process');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = parseInt(process.env.PORT || '3000', 10);
// In the packaged .exe (pkg) the config is stored next to the executable
const PACKAGED = typeof process.pkg !== 'undefined';
const CONFIG_PATH =
  process.env.CONFIG_PATH ||
  (PACKAGED
    ? path.join(path.dirname(process.execPath), 'ma3-focus-buddy-config.json')
    : path.join(__dirname, '..', 'data', 'config.json'));

function parseJson(str) {
  if (!str) return {};
  try {
    const obj = JSON.parse(str);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) {
    console.warn('[config] MA3_ATTRIBUTE_MAP is not valid JSON, ignored.');
    return {};
  }
}

/* ------------------------------------------------------------------ *
 * Attribute names: logical name (frontend) -> MA3 attribute name.
 * Override via MA3_ATTRIBUTE_MAP (JSON) if your fixtures use other names.
 * ------------------------------------------------------------------ */
const ATTRIBUTE_MAP = Object.assign(
  {
    Pan: 'Pan',
    Tilt: 'Tilt',
    Zoom: 'Zoom',
    Focus: 'Focus1',
    Blade1: 'Blade1A',
    Blade2: 'Blade2A',
    Blade3: 'Blade3A',
    Blade4: 'Blade4A',
    Blade1Rot: 'Blade1Rot',
    Blade2Rot: 'Blade2Rot',
    Blade3Rot: 'Blade3Rot',
    Blade4Rot: 'Blade4Rot'
  },
  parseJson(process.env.MA3_ATTRIBUTE_MAP)
);

/* ------------------------------------------------------------------ *
 * Settings: saved config > environment variables > default (127.0.0.1:8000).
 * ------------------------------------------------------------------ */
const HOST_RE = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;

function validTarget(ip, port) {
  return typeof ip === 'string' && HOST_RE.test(ip) && Number.isInteger(port) && port >= 1 && port <= 65535;
}

function loadConfig() {
  const legacy = {
    ip: (process.env.MA3_IP || '127.0.0.1').trim(),
    port: parseInt(process.env.MA3_PORT || '8000', 10)
  };
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (saved && saved.clients && typeof saved.clients === 'object') {
      return saved;
    }
    if (validTarget(saved.ip, saved.port)) {
      legacy.ip = saved.ip;
      legacy.port = saved.port;
    }
  } catch (e) {
    /* no saved config */
  }
  return { clients: {}, legacy };
}

function saveConfig(store) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(store, null, 2));
  } catch (e) {
    console.warn('[config] saving failed:', e.message);
  }
}

function safeClientId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(value) ? value : null;
}

function safeClientName(value) {
  return typeof value === 'string'
    ? sanitizeText(value, 60) || 'Unnamed client'
    : 'Unnamed client';
}

function safeClientSettings(settings) {
  if (!settings || typeof settings !== 'object') return {};
  const result = {};
  if (Array.isArray(settings.frost) && settings.frost.length === 4 &&
      settings.frost.every((v) => typeof v === 'string' && /^\d+(?:\.\d+)?$/.test(v))) {
    result.frost = settings.frost;
  }
  if (Array.isArray(settings.bar) && settings.bar.length <= 50) {
    result.bar = settings.bar
      .filter((v) => v && typeof v === 'object' && typeof v.label === 'string' && typeof v.cmd === 'string')
      .map((v) => ({
        id: sanitizeText(v.id, 80),
        label: sanitizeText(v.label, 30),
        cmd: sanitizeText(v.cmd, 200),
        visible: v.visible !== false,
        custom: v.custom === true
      }));
  }
  if (Array.isArray(settings.toggles) && settings.toggles.length <= 100) {
    result.toggles = settings.toggles
      .filter((v) => v && typeof v === 'object' && typeof v.label === 'string' && Number.isFinite(Number(v.seq)) && Number(v.seq) > 0)
      .map((v) => ({ label: sanitizeText(v.label, 30), seq: Number(v.seq) }));
  }
  if (typeof settings.page === 'string' && ['encoders', 'shapers', 'toggles', 'fixtures', 'colours'].includes(settings.page)) {
    result.page = settings.page;
  }
  if (validTarget(settings.ip, settings.port)) {
    result.ip = settings.ip;
    result.port = settings.port;
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * MA3 via OSC (UDP, default port 8000).
 * On the console: Setup > In & Out > OSC: a line with the chosen port and
 * "Receive Command" = Yes, and "Enable Input" at the top. Every command is sent
 * as an OSC message "/cmd" with the command as string argument. There is no feedback.
 * ------------------------------------------------------------------ */
function oscPad(buf) {
  const pad = (4 - (buf.length % 4)) % 4;
  return Buffer.concat([buf, Buffer.alloc(pad)]);
}

function oscString(str) {
  return oscPad(Buffer.concat([Buffer.from(str, 'utf8'), Buffer.from([0])]));
}

function encodeOsc(address, args) {
  const tags = ',' + args.map(() => 's').join('');
  return Buffer.concat([oscString(address), oscString(tags), ...args.map((a) => oscString(String(a)))]);
}

/* ------------------------------------------------------------------ *
 * OSC decoding (feedback from the MA3 plugin).
 * ------------------------------------------------------------------ */
function readOscString(buf, offset) {
  const end = buf.indexOf(0, offset);
  if (end === -1) return null;
  return { value: buf.toString('utf8', offset, end), next: end + 1 + ((4 - ((end + 1) % 4)) % 4) };
}

function decodeOscMessage(buf) {
  const address = readOscString(buf, 0);
  if (!address) return null;
  const tags = readOscString(buf, address.next);
  if (!tags || !tags.value.startsWith(',')) return null;
  const args = [];
  let offset = tags.next;
  for (const tag of tags.value.slice(1)) {
    if (tag === 'i' || tag === 'f') {
      if (offset + 4 > buf.length) return null;
      args.push(tag === 'i' ? buf.readInt32BE(offset) : buf.readFloatBE(offset));
      offset += 4;
    } else if (tag === 's') {
      const str = readOscString(buf, offset);
      if (!str) return null;
      args.push(str.value);
      offset = str.next;
    } else if (tag === 'T') args.push(true);
    else if (tag === 'F') args.push(false);
    else return null;
  }
  return { address: address.value, args };
}

class MA3Link {
  constructor(cfg, onStatus) {
    this.onStatus = onStatus;
    this.socket = dgram.createSocket('udp4');
    this.socket.on('error', (err) => this.reportError(err.message));
    this.lastError = null;
    this.reachable = null;
    this.lastPingAt = null;
    this.pingError = null;
    this.configure(cfg, false);
  }

  configure(cfg, notify = true) {
    this.ip = cfg.ip;
    this.port = cfg.port;
    this.lastError = null;
    this.reachable = null;
    this.lastPingAt = null;
    this.pingError = null;
    this.mode = cfg.ip ? 'osc' : 'simulation';
    if (notify) this.onStatus();
  }

  status() {
    return {
      mode: this.mode,
      target: this.ip || null,
      ip: this.ip || '',
      port: this.port,
      reachable: this.reachable,
      lastPingAt: this.lastPingAt,
      pingError: this.pingError
    };
  }

  reportError(message) {
    if (message !== this.lastError) console.warn(`[ma3] error: ${message}`);
    this.lastError = message;
  }

  send(command) {
    if (this.mode === 'simulation') {
      console.log('[sim] ->', command);
      return true;
    }
    console.log(`[osc] -> ${this.ip}:${this.port} /cmd "${command}"`);
    this.socket.send(encodeOsc('/cmd', [command]), this.port, this.ip, (err) => {
      if (err) this.reportError(err.message);
    });
    return true;
  }
}

/* ------------------------------------------------------------------ *
 * Translate PWA messages to MA3 commands.
 * ------------------------------------------------------------------ */
function sanitizeText(s, max = 200) {
  return String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function num(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function fmt(n) {
  return String(Math.round(n * 100) / 100);
}

function buildCommands(msg) {
  switch (msg.type) {
    case 'encoder': {
      const attr = ATTRIBUTE_MAP[msg.attr];
      const amount = num(msg.amount, -100, 100);
      if (!attr || amount === null || amount === 0) return [];
      const sign = amount > 0 ? '+' : '-';
      return [`Attribute "${attr}" At ${sign} ${fmt(Math.abs(amount))}`];
    }
    case 'cmd': {
      const cmd = sanitizeText(msg.cmd);
      return cmd ? [cmd] : [];
    }
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ *
 * HTTP + WebSocket
 * ------------------------------------------------------------------ */
const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });

const store = loadConfig();
const links = new Map();
const PING_INTERVAL = 15000;
const PING_TIMEOUT = 3000;

/* ------------------------------------------------------------------ *
 * Group feedback from the MA3 plugin (OSC in). The MA3 sends its feedback
 * to the port of the OSC line in In & Out. The server listens on the same
 * UDP port the client uses to talk to the MA3 (per client), so one OSC
 * line is enough. OSC_IN_PORT overrides this for all clients.
 * The plugin only sends when the PWA asks.
 * ------------------------------------------------------------------ */
const OSC_IN_OVERRIDE = process.env.OSC_IN_PORT ? parseInt(process.env.OSC_IN_PORT, 10) : null;
const groupCollectors = new Map(); // clientId -> { groups: [], timer }
const colourCollectors = new Map(); // clientId -> { colours: [], timer }
const oscReceivers = new Map(); // port -> socket

function broadcastGroups(clientId, payload) {
  const data = JSON.stringify(payload);
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN && ws.clientId === clientId) ws.send(data);
  }
}

function handleGroupMessage(msg) {
  if (msg.address.startsWith('/ma3focusbuddy/colour')) {
    handleColourMessage(msg);
    return;
  }
  const collectors = [...groupCollectors.values()];
  if (!collectors.length) return;
  if (msg.address === '/ma3focusbuddy/groups/begin') {
    for (const c of collectors) c.groups = [];
  } else if (msg.address === '/ma3focusbuddy/group' && msg.args.length >= 2) {
    const number = Number(msg.args[0]);
    const name = String(msg.args[1]);
    if (Number.isFinite(number)) {
      for (const c of collectors) c.groups.push({ number, name });
    }
  } else if (msg.address === '/ma3focusbuddy/groups/end') {
    for (const [clientId, c] of groupCollectors) {
      clearTimeout(c.timer);
      c.timer = null;
      const groups = c.groups.slice().sort((a, b) => a.number - b.number);
      groupCollectors.delete(clientId);
      broadcastGroups(clientId, { type: 'groups', groups });
    }
  }
}

function handleColourMessage(msg) {
  if (!colourCollectors.size) return;
  if (msg.address === '/ma3focusbuddy/colours/begin') {
    for (const c of colourCollectors.values()) c.colours = [];
  } else if (msg.address === '/ma3focusbuddy/colour' && msg.args.length >= 2) {
    const number = Number(msg.args[0]);
    const name = String(msg.args[1]);
    if (Number.isFinite(number)) {
      for (const c of colourCollectors.values()) c.colours.push({ number, name });
    }
  } else if (msg.address === '/ma3focusbuddy/colours/end') {
    for (const [clientId, c] of colourCollectors) {
      clearTimeout(c.timer);
      c.timer = null;
      const colours = c.colours.slice().sort((a, b) => a.number - b.number);
      colourCollectors.delete(clientId);
      broadcastGroups(clientId, { type: 'colours', colours });
    }
  }
}

function ensureOscReceiver(port) {
  const listenPort = OSC_IN_OVERRIDE || port;
  if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) return;
  if (oscReceivers.has(listenPort)) return;
  const socket = dgram.createSocket('udp4');
  socket.on('error', (err) => console.warn(`[osc-in:${listenPort}] error:`, err.message));
  socket.on('message', (buf, rinfo) => {
    const msg = decodeOscMessage(buf);
    if (msg) handleGroupMessage(msg);
    else console.warn(`[osc-in:${listenPort}] undecodable packet from`, rinfo.address + ':' + rinfo.port);
  });
  socket.on('listening', () => {
    console.log(`OSC feedback listening on UDP port ${listenPort}`);
  });
  socket.bind(listenPort);
  oscReceivers.set(listenPort, socket);
}
function defaultClientConfig() {
  return store.legacy && validTarget(store.legacy.ip, store.legacy.port)
    ? store.legacy
    : { ip: '127.0.0.1', port: 8000 };
}
function getClient(clientId, submitted) {
  let client = store.clients[clientId];
  if (!client) {
    const settings = safeClientSettings(submitted && submitted.settings);
    const target = validTarget(settings.ip, settings.port) ? settings : defaultClientConfig();
    client = store.clients[clientId] = {
      name: safeClientName(submitted && (submitted.name || (submitted.settings && submitted.settings.name))),
      ip: target.ip,
      port: target.port,
      settings,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };
    saveConfig(store);
  }
  client.lastSeenAt = new Date().toISOString();
  return client;
}
function getLink(clientId, client) {
  if (!links.has(clientId)) links.set(clientId, new MA3Link({ ip: client.ip, port: client.port }, () => {}));
  return links.get(clientId);
}

function pingArgs(host) {
  if (process.platform === 'win32') return ['-n', '1', '-w', String(PING_TIMEOUT), host];
  if (process.platform === 'darwin') return ['-c', '1', '-W', String(PING_TIMEOUT), host];
  return ['-c', '1', '-W', String(Math.ceil(PING_TIMEOUT / 1000)), host];
}

function broadcastClientStatus(clientId) {
  const link = links.get(clientId);
  if (!link) return;
  const payload = JSON.stringify({ type: 'status', ...link.status() });
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN && ws.clientId === clientId) ws.send(payload);
  }
}

function checkReachability(clientId, client) {
  const link = getLink(clientId, client);
  link.lastPingAt = new Date().toISOString();
  execFile('ping', pingArgs(client.ip), { timeout: PING_TIMEOUT + 500, windowsHide: true }, (error) => {
    link.reachable = !error;
    link.pingError = error ? 'Host did not respond to ping' : null;
    broadcastClientStatus(clientId);
  });
}

function checkAllReachability() {
  for (const [clientId, client] of Object.entries(store.clients)) checkReachability(clientId, client);
}

app.get('/api/clients', (req, res) => {
  res.json(Object.entries(store.clients).map(([id, client]) => ({
    id, name: client.name, ip: client.ip, port: client.port, lastSeenAt: client.lastSeenAt
  })));
});

wss.on('connection', (ws, req) => {
  console.log('[ws] client connected:', req.socket.remoteAddress);
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.send(JSON.stringify({ type: 'awaitingClientId' }));

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
    if (msg.type === 'registerClient') {
      const clientId = safeClientId(msg.clientId);
      if (!clientId) return ws.send(JSON.stringify({ type: 'configError', error: 'Invalid client ID' }));
      ws.clientId = clientId;
      ws.client = getClient(clientId, msg);
      const link = getLink(clientId, ws.client);
      ensureOscReceiver(ws.client.port);
      ws.send(JSON.stringify({
        type: 'clientSettings',
        name: ws.client.name,
        settings: ws.client.settings
      }));
      checkReachability(clientId, ws.client);
      return ws.send(JSON.stringify({ type: 'status', ...link.status() }));
    }
    if (!ws.clientId || !ws.client) return;
    if (msg.type === 'setConfig') {
      const ip = typeof msg.ip === 'string' ? msg.ip.trim() : '';
      const port = parseInt(msg.port, 10);
      if (!validTarget(ip, port)) {
        return ws.send(JSON.stringify({ type: 'configError', error: 'Invalid IP address or port' }));
      }
      const cfg = { ip, port };
      console.log(`[config] new MA3 target: ${ip}:${port}`);
      ws.client.ip = ip;
      ws.client.port = port;
      ws.client.settings.ip = ip;
      ws.client.settings.port = port;
      getLink(ws.clientId, ws.client).configure(cfg);
      ensureOscReceiver(port);
      saveConfig(store);
      checkReachability(ws.clientId, ws.client);
      return ws.send(JSON.stringify({ type: 'status', ...getLink(ws.clientId, ws.client).status() }));
    }
    if (msg.type === 'saveSettings') {
      const settings = safeClientSettings(msg.settings);
      if (settings.ip && settings.port) {
        const targetChanged = settings.ip !== ws.client.ip || settings.port !== ws.client.port;
        ws.client.ip = settings.ip;
        ws.client.port = settings.port;
        getLink(ws.clientId, ws.client).configure({ ip: settings.ip, port: settings.port });
        ensureOscReceiver(settings.port);
        if (targetChanged) checkReachability(ws.clientId, ws.client);
      }
      if (msg.settings && msg.settings.name) ws.client.name = safeClientName(msg.settings.name);
      ws.client.settings = { ...ws.client.settings, ...settings };
      saveConfig(store);
      ws.send(JSON.stringify({ type: 'clientSettings', name: ws.client.name, settings: ws.client.settings }));
      return ws.send(JSON.stringify({ type: 'status', ...getLink(ws.clientId, ws.client).status() }));
    }
    if (msg.type === 'renameClient') {
      ws.client.name = safeClientName(msg.name);
      saveConfig(store);
      return ws.send(JSON.stringify({ type: 'clientSettings', name: ws.client.name, settings: ws.client.settings }));
    }
    if (msg.type === 'deleteClient') {
      const targetId = safeClientId(msg.clientId) || ws.clientId;
      delete store.clients[targetId];
      links.delete(targetId);
      saveConfig(store);
      return ws.send(JSON.stringify({ type: 'clientDeleted', clientId: targetId }));
    }
    if (msg.type === 'requestGroups') {
      const existing = groupCollectors.get(ws.clientId);
      if (existing && existing.timer) clearTimeout(existing.timer);
      const collector = { groups: [], timer: null };
      collector.timer = setTimeout(() => {
        if (groupCollectors.get(ws.clientId) === collector) {
          groupCollectors.delete(ws.clientId);
          broadcastGroups(ws.clientId, { type: 'groupsTimeout' });
        }
      }, 8000);
      groupCollectors.set(ws.clientId, collector);
      getLink(ws.clientId, ws.client).send('Plugin "MA3 Focus Buddy Groups"');
      return;
    }
    if (msg.type === 'requestColours') {
      const existing = colourCollectors.get(ws.clientId);
      if (existing && existing.timer) clearTimeout(existing.timer);
      const collector = { colours: [], timer: null };
      collector.timer = setTimeout(() => {
        if (colourCollectors.get(ws.clientId) === collector) {
          colourCollectors.delete(ws.clientId);
          broadcastGroups(ws.clientId, { type: 'coloursTimeout' });
        }
      }, 8000);
      colourCollectors.set(ws.clientId, collector);
      getLink(ws.clientId, ws.client).send('Plugin "MA3 Focus Buddy Colours"');
      return;
    }
    for (const command of buildCommands(msg)) getLink(ws.clientId, ws.client).send(command);
  });

  ws.on('close', () => {
    if (ws.client) {
      ws.client.lastSeenAt = new Date().toISOString();
      saveConfig(store);
    }
    console.log('[ws] client gone');
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

checkAllReachability();
setInterval(checkAllReachability, PING_INTERVAL);

server.on('error', (err) => {
  console.error(`Server cannot start: ${err.message}`);
  if (PACKAGED) setTimeout(() => process.exit(1), 15000);
  else process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MA3 Focus Buddy running on http://0.0.0.0:${PORT}`);
  for (const list of Object.values(require('os').networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  Open on your iPad: http://${i.address}:${PORT}`);
    }
  }
  console.log('Per-client MA3 targets enabled');
});
