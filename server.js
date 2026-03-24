// Simple coop relay server with ready/countdown

const http = require('http');
const { WebSocketServer } = require('ws'); // ✅ FIX: geen dubbele WebSocket

const PORT = process.env.PORT || 3000;

const server = http.createServer();
const wss = new WebSocketServer({ server });

const clients = new Map();
let readyMap = {};
let countdown = 0;
let countdownTimer = null;

// ─────────────────────────────────────────────

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const [id, c] of clients.entries()) {
    if (c.ws.readyState === 1) { // 1 = OPEN
      c.ws.send(data);
    }
  }
}

function broadcastPlayers() {
  const players = {};
  for (const [id, c] of clients.entries()) {
    if (c.info) players[id] = c.info;
  }
  broadcast({ type: 'players', players });
}

function broadcastReady() {
  broadcast({ type: 'ready_update', ready: readyMap });
}

// ─────────────────────────────────────────────

function startCountdown() {
  if (countdownTimer) return;

  countdown = 30;
  broadcast({ type: 'countdown', seconds: countdown });

  countdownTimer = setInterval(() => {
    countdown--;

    broadcast({ type: 'countdown', seconds: countdown });

    const ids = Array.from(clients.keys());
    const allReady =
      ids.length > 0 && ids.every(id => readyMap[id]);

    if (allReady || countdown <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      countdown = 0;

      // reset ready
      for (const id of Object.keys(readyMap)) {
        readyMap[id] = false;
      }

      broadcastReady();
      broadcast({ type: 'start_wave' });
    }
  }, 1000);
}

// ─────────────────────────────────────────────

wss.on('connection', (ws) => {
  let clientId = null;

  ws.on('message', (m) => {
    try {
      const msg = JSON.parse(m.toString());

      // HELLO
      if (msg.type === 'hello') {
        clientId = msg.id;

        clients.set(clientId, {
          ws,
          info: {
            id: msg.id,
            name: msg.name || msg.id,
            x: 0,
            y: 0
          }
        });

        readyMap[clientId] = false;

        broadcastPlayers();
        broadcastReady();
      }

      // POSITION UPDATE
      if (msg.type === 'pos' && clientId) {
        const c = clients.get(clientId);
        if (c) {
          c.info = {
            id: msg.id,
            name: msg.name || c.info.name,
            x: msg.x,
            y: msg.y,
            health: msg.health,
            ammo: msg.ammo,
            weapon: msg.weapon
          };
        }

        broadcastPlayers();
      }

      // READY SYSTEM
      if (msg.type === 'ready' && clientId) {
        readyMap[msg.id] = !!msg.ready;

        broadcastReady();

        const ids = Array.from(clients.keys());
        const allReady =
          ids.length > 0 && ids.every(id => readyMap[id]);

        if (allReady) {
          // start meteen
          if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
          }

          for (const id of Object.keys(readyMap)) {
            readyMap[id] = false;
          }

          broadcastReady();
          broadcast({ type: 'start_wave' });
        } else {
          const anyoneReady =
            Object.values(readyMap).some(v => v);

          if (anyoneReady && !countdownTimer) {
            startCountdown();
          }
        }
      }

      // SHOOT SYNC
      if (msg.type === 'shoot') {
        broadcast({
          type: 'shoot',
          from: msg.id,
          x: msg.x,
          y: msg.y,
          a: msg.a,
          expl: msg.expl
        });
      }

      // LEAVE
      if (msg.type === 'leave' && msg.id) {
        if (clients.has(msg.id)) {
          clients.get(msg.id).ws.close();
          clients.delete(msg.id);
          delete readyMap[msg.id];

          broadcastPlayers();
          broadcastReady();
        }
      }

    } catch (e) {
      console.warn('Bad message:', e);
    }
  });

  ws.on('close', () => {
    if (clientId) {
      clients.delete(clientId);
      delete readyMap[clientId];

      broadcastPlayers();
      broadcastReady();
    }
  });
});

// ─────────────────────────────────────────────

server.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Server running on port " + PORT);
});
