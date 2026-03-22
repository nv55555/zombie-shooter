// Simple coop relay server with ready/countdown.
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3000 });

const clients = new Map();
let readyMap = {};
let countdown = 0;
let countdownTimer = null;

function broadcast(msg){
  const data = JSON.stringify(msg);
  for(const [id, c] of clients.entries()){
    if(c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
  }
}

function broadcastPlayers(){
  const players = {};
  for(const [id, c] of clients.entries()){
    if(c.info) players[id] = c.info;
  }
  broadcast({ type: 'players', players });
}

function broadcastReady(){
  broadcast({ type: 'ready_update', ready: readyMap });
}

function startCountdown(){
  if(countdownTimer) return;
  countdown = 30;
  broadcast({ type: 'countdown', seconds: countdown });
  countdownTimer = setInterval(()=>{
    countdown--;
    broadcast({ type: 'countdown', seconds: countdown });
    const ids = Array.from(clients.keys());
    const allReady = ids.length>0 && ids.every(id => readyMap[id]);
    if(allReady){
      clearInterval(countdownTimer); countdownTimer = null; countdown = 0;
      for(const id of Object.keys(readyMap)) readyMap[id] = false;
      broadcastReady();
      broadcast({ type: 'start_wave' });
      return;
    }
    if(countdown <= 0){
      clearInterval(countdownTimer); countdownTimer = null; countdown = 0;
      for(const id of Object.keys(readyMap)) readyMap[id] = false;
      broadcastReady();
      broadcast({ type: 'start_wave' });
    }
  }, 1000);
}

wss.on('connection', (ws) => {
  let clientId = null;
  ws.on('message', (m) => {
    try{
      const msg = JSON.parse(m.toString());
      if(msg.type === 'hello'){
        clientId = msg.id;
        clients.set(clientId, { ws, info: { id: msg.id, name: msg.name || msg.id, x:0, y:0 } });
        readyMap[clientId] = false;
        broadcastPlayers();
        broadcastReady();
      }
      if(msg.type === 'pos' && clientId){
        const c = clients.get(clientId);
        if(c) c.info = { id: msg.id, name: msg.name || c.info.name, x: msg.x, y: msg.y, health: msg.health, ammo: msg.ammo, weapon: msg.weapon };
        broadcastPlayers();
      }
      if(msg.type === 'ready' && clientId){
        readyMap[msg.id] = !!msg.ready;
        broadcastReady();
        const ids = Array.from(clients.keys());
        const allReady = ids.length>0 && ids.every(id => readyMap[id]);
        if(allReady){
          if(countdownTimer){ clearInterval(countdownTimer); countdownTimer=null; countdown=0; }
          for(const id of Object.keys(readyMap)) readyMap[id] = false;
          broadcastReady();
          broadcast({ type: 'start_wave' });
        } else {
          const anyoneReady = Object.values(readyMap).some(v => v);
          if(anyoneReady && !countdownTimer) startCountdown();
        }
      }
      if(msg.type === 'leave' && msg.id){
        if(clients.has(msg.id)){ clients.get(msg.id).ws.close(); clients.delete(msg.id); delete readyMap[msg.id]; broadcastPlayers(); broadcastReady(); }
      }
      if(msg.type === 'shop_buy'){
        // no server validation
      }
      if(msg.type === 'shoot'){
        broadcast({ type:'shoot', from: msg.id, x: msg.x, y: msg.y, a: msg.a, expl: msg.expl });
      }
    }catch(e){ console.warn('bad msg', e); }
  });

  ws.on('close', ()=>{
    if(clientId){
      clients.delete(clientId);
      delete readyMap[clientId];
      broadcastPlayers();
      broadcastReady();
    }
  });
});

console.log('Coop relay server running on ws://localhost:3000');