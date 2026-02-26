require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// ==================== CONFIG ====================
const app = express();
const PORT = process.env.PORT || 3000;
const GROUP_JID = process.env.GROUP_JID || '';
const AUTH_FOLDER = 'auth_info_baileys';

// ==================== STATE ====================
let sock, isConnected = false, esp32Client = null, currentChatContext = null, latestQR = null;
const processedMessages = new Set();
const MAX_PROCESSED_MESSAGES = 1000;
let isReconnecting = false;
let isShuttingDown = false;

// ==================== COMMAND MAPPING ====================
const COMMAND_MAP = {
  hidup: 'pump_on',
  mati: 'pump_off',
  status: 'status'
};

const REPLY_MESSAGES = {
  pump_on: '⚡ Mesin air hidup!',
  pump_off: '🛑 Mesin air mati!',
  status: (pumpState) => `ℹ️ Status Pompa: ${pumpState ? 'Hidup ⚡' : 'Mati 🛑'}`
};

// ==================== HELPERS ====================
const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  rocket: (msg) => console.log(`🚀 ${msg}`)
};

function cleanupAuthSession() {
  const authPath = path.join(__dirname, AUTH_FOLDER);
  if (fs.existsSync(authPath)) {
    fs.rmSync(authPath, { recursive: true, force: true });
    log.info('Auth session deleted');
  }
  isConnected = false;
  sock = null;
  latestQR = null;
}

function addToProcessedMessages(msgId) {
  processedMessages.add(msgId);
  if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
    processedMessages.delete(processedMessages.values().next().value);
  }
}

function parseCommand(text) {
  return Object.keys(COMMAND_MAP).find(key => text.includes(key));
}

function renderHTML(title, body, autoRefresh = false) {
  return `<!DOCTYPE html><html><head><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;text-align:center;padding:50px;background:#f0f0f0}h1{color:#25D366}img{max-width:400px;border:5px solid #25D366;border-radius:10px;background:#fff;padding:20px}.info{background:#fff;padding:20px;margin:20px auto;max-width:500px;border-radius:10px}ol{text-align:left}</style>${autoRefresh ? '<script>setTimeout(()=>location.reload(),5000)</script>' : ''}</head><body>${body}</body></html>`;
}

// ==================== WHATSAPP BOT ====================
async function startWhatsAppBot() {
  if (isReconnecting) {
    log.warn('Already reconnecting, skip...');
    return;
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();

    // Cleanup old socket jika ada
    if (sock) {
      log.info('Cleaning up old socket...');
      sock.ev.removeAllListeners();
      sock.end();
      sock = null;
    }

    sock = makeWASocket({ 
      version, 
      logger: pino({ level: 'silent' }), 
      printQRInTerminal: false, 
      auth: state,
      connectTimeoutMs: 60000
    });
    
    sock.ev.on('creds.update', saveCreds);
  
  // Connection handler
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n========== SCAN QR CODE ==========');
      console.log(await qrcode.toString(qr, { type: 'terminal', small: true }));
      console.log('==================================\n');
      latestQR = await qrcode.toDataURL(qr);
    }
    
    if (connection === 'close') {
      isConnected = false;
      currentChatContext = null;
      
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = Object.keys(DisconnectReason).find(
        key => DisconnectReason[key] === statusCode
      ) || 'Unknown';
      
      log.warn(`Disconnected: ${reason} (${statusCode})`);
      
      if (statusCode === DisconnectReason.loggedOut) {
        // Only cleanup auth if not gracefully shutting down
        if (!isShuttingDown) {
          log.error('Logged out! Session terminated.');
          cleanupAuthSession();
        } else {
          log.info('Graceful shutdown, preserving auth session.');
        }
      } else if (statusCode === DisconnectReason.badSession) {
        log.error('Bad session detected! Cleaning up...');
        cleanupAuthSession();
        isReconnecting = true;
        setTimeout(async () => {
          isReconnecting = false;
          await startWhatsAppBot();
        }, 5000);
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        log.error('Connection replaced by another device!');
        cleanupAuthSession();
      } else {
        log.info('Reconnecting in 3 seconds...');
        isReconnecting = true;
        setTimeout(async () => {
          isReconnecting = false;
          await startWhatsAppBot();
        }, 3000);
      }
    } else if (connection === 'open') {
      log.success('WhatsApp connected');
      isConnected = true;
      latestQR = null;
      isReconnecting = false;
      processedMessages.clear();
      log.info('Session ready!');
    }
  });

  // Message handler
  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe || processedMessages.has(msg.key.id)) return;
      
      addToProcessedMessages(msg.key.id);
      
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase();
      if (!text) return;

      const isGroup = msg.key.remoteJid.endsWith('@g.us');
      if (isGroup) {
        log.info(`Group: ${msg.key.remoteJid}`);
        if (!text.startsWith('!')) return; // Group requires "!" prefix
      }

      const commandKey = parseCommand(text);
      const command = COMMAND_MAP[commandKey];
      
      if (command) {
        // Cek ESP32 connection
        const esp32Connected = esp32Client?.readyState === 1;
        
        if (esp32Connected) {
          // ESP32 online → Forward command
          currentChatContext = { chatId: msg.key.remoteJid, quotedMsg: msg };
          esp32Client.send(JSON.stringify({ command, timestamp: Date.now() }));
          log.rocket(`${command} → ESP32`);
        } else {
          // ESP32 offline → Reply langsung dengan error
          const errorMsg = command === 'status'
            ? 'ℹ️ Status Sistem:\n✅ WhatsApp: Connected\n❌ ESP32: Offline\n\n⚠️ Perangkat tidak terhubung!'
            : '❌ ESP32 Offline!\n\nPerangkat sedang tidak terhubung. Silakan cek koneksi ESP32.';
          
          await sock.sendMessage(msg.key.remoteJid, { text: errorMsg }, { quoted: msg });
          log.warn(`Command ${command} rejected - ESP32 offline`);
        }
      }
    } catch (error) {
      log.error(`Message handler: ${error.message}`);
    }
  });
    
  } catch (error) {
    log.error(`WhatsApp Bot Error: ${error.message}`);
    
    if (error.message.includes('decrypt') || error.message.includes('ENOENT')) {
      log.error('Session corrupt! Cleaning up...');
      cleanupAuthSession();
      isReconnecting = true;
      setTimeout(async () => {
        isReconnecting = false;
        await startWhatsAppBot();
      }, 5000);
    }
  }
}

async function sendConfirmation(command, pumpState, additionalData = {}) {
  if (!currentChatContext || !sock) return;
  
  try {
    let message = '';
    
    if (command === 'status') {
      // Format status detail dengan data dari ESP32
      const waterLevel = additionalData.waterLevel || 0;
      const safetyMode = additionalData.safetyMode || false;
      const threshold = additionalData.threshold || 3000;
      const isFull = waterLevel < threshold;
      const statusEmoji = isFull ? '✅' : '⭕';
      const statusText = isFull ? 'PENUH' : 'BELUM PENUH';
      
      message = `📊 *STATUS SISTEM*\n\n` +
        `💧 Pompa: ${pumpState ? '⚡ HIDUP' : '🛑 MATI'}\n` +
        `🔒 Safety Mode: ${safetyMode ? '🔒 ON' : '🔓 OFF'}\n\n` +
        `💧 *Sensor Air*\n` +
        `  Threshold: ${threshold}\n` +
        `  Level: ${waterLevel} / 4095\n` +
        `  Status: ${statusEmoji} ${statusText}`;
    } else {
      // Generic reply untuk command lainnya
      const msgTemplate = REPLY_MESSAGES[command];
      message = typeof msgTemplate === 'function' ? msgTemplate(pumpState) : msgTemplate;
    }
    
    if (message) {
      await sock.sendMessage(currentChatContext.chatId, { text: message }, { quoted: currentChatContext.quotedMsg });
      log.success(`Reply: ${message.substring(0, 50)}...`);
      currentChatContext = null;
    }
  } catch (error) {
    log.error(`Send: ${error.message}`);
  }
}

// ==================== WEBSOCKET SERVER ====================
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  log.success('ESP32 connected');
  esp32Client = ws;

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'confirm') {
        log.info(`Confirm: ${msg.command} (Pump: ${msg.pumpState ? 'ON' : 'OFF'})`);
        // Kirim data tambahan untuk command status
        const additionalData = {
          waterLevel: msg.waterLevel || 0,
          safetyMode: msg.safetyMode || false,
          threshold: msg.threshold || 3000,
          relayState: msg.relayState
        };
        await sendConfirmation(msg.command, msg.pumpState, additionalData);
      } 
      else if (msg.type === 'water_full') {
        log.warn(`Water full! Sensor: ${msg.sensorValue}`);
        
        const alertText = `⚠️ *TANDON PENUH!*\n\n` +
          `Pompa telah dimatikan otomatis untuk mencegah overflow.\n\n` +
          `💧 Sensor: ${msg.sensorValue}`;
        
        if (isConnected) {
          if (GROUP_JID) {
            // Kirim ke group jika GROUP_JID dikonfigurasi
            await sock.sendMessage(GROUP_JID, { text: alertText });
            log.success('Water alert sent to group');
          } else if (currentChatContext) {
            // Fallback ke currentChatContext jika GROUP_JID kosong
            await sock.sendMessage(currentChatContext.chatId, { text: alertText });
            log.success('Water alert sent to current chat');
          }
        }
      }
      else if (msg.type === 'command_rejected') {
        log.warn(`Command rejected: ${msg.command} - ${msg.reason}`);
        if (isConnected && currentChatContext) {
          const rejectMessage = `🚫 *PERINTAH DITOLAK!*\n\n${msg.reason}\n\n_Tunggu sampai air berkurang dulu, baru bisa hidupkan pompa._`;
          await sock.sendMessage(currentChatContext.chatId, { text: rejectMessage }, { quoted: currentChatContext.quotedMsg });
          log.success('Rejection sent to chat');
        }
      }
    } catch (error) {
      log.error(`WebSocket: ${error.message}`);
    }
  });

  ws.on('close', () => {
    log.error('ESP32 disconnected');
    esp32Client = null;
    currentChatContext = null;
  });
});

// ==================== HTTP ENDPOINTS ====================
app.get('/status', (req, res) => {
  res.json({
    whatsapp: isConnected ? 'connected' : 'disconnected',
    esp32: esp32Client ? 'connected' : 'disconnected'
  });
});

app.get('/logout', async (req, res) => {
  try {
    log.info('Logging out...');
    if (sock) await sock.logout();
    cleanupAuthSession();
    res.json({ success: true, message: 'Logged out. Restart server to login again.' });
  } catch (error) {
    log.error(`Logout: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/relogin', async (req, res) => {
  try {
    log.info('Re-login initiated...');
    if (sock) await sock.logout();
    cleanupAuthSession();
    setTimeout(async () => {
      log.rocket('Starting new WhatsApp session...');
      await startWhatsAppBot();
    }, 2000);
    res.json({ success: true, message: 'Re-login started. Check /qr endpoint.' });
  } catch (error) {
    log.error(`Relogin: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/qr', (req, res) => {
  if (!latestQR) {
    const status = isConnected ? '✅ Already connected!' : '⏳ Waiting for QR code...';
    return res.send(renderHTML('WhatsApp QR', `<h1>📱 WhatsApp QR Code</h1><p>${status}</p><p><a href="/qr">🔄 Refresh</a> | <a href="/relogin">🔓 Re-login</a></p>`));
  }
  
  const body = `<h1>📱 Scan QR Code dengan WhatsApp</h1><img src="${latestQR}" alt="QR Code"/><div class="info"><p><strong>Cara Scan:</strong></p><ol><li>Buka WhatsApp di HP</li><li>Tap Menu (⋮) atau Settings</li><li>Pilih "Linked Devices"</li><li>Tap "Link a Device"</li><li>Scan QR code di atas</li></ol><p><a href="/status">📊 Status</a> | <a href="/relogin">🔓 Re-login</a></p></div>`;
  res.send(renderHTML('WhatsApp QR Code', body, true));
});

app.get('/', (req, res) => {
  res.json({ name: 'ESP32 WhatsApp Bot', version: '4.1.0', status: { whatsapp: isConnected, esp32: esp32Client !== null } });
});

// ==================== SERVER START ====================
server.listen(PORT, async () => {
  log.rocket(`Server running on port ${PORT}`);
  await startWhatsAppBot();
});

// Graceful shutdown function
function gracefulShutdown() {
  console.log('\n🛑 Shutting down gracefully...');
  isShuttingDown = true;
  
  if (sock) {
    // Remove event listeners BEFORE closing to prevent disconnect handler from running
    sock.ev.removeAllListeners('connection.update');
    sock.ev.removeAllListeners('messages.upsert');
    sock.ev.removeAllListeners('creds.update');
    log.info('✅ Auth session preserved');
    sock.end();
  }
  
  server.close(() => {
    log.info('Server closed');
    process.exit(0);
  });
  
  // Force exit after 5s if not closed
  setTimeout(() => {
    log.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

// Handle Ctrl+C and Docker stop
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
