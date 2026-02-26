# ESP32 Water Pump Control via WhatsApp Bot

Bot server untuk mengontrol pompa air ESP32 via WhatsApp dengan automated safety controls.

## 📋 Fitur

- ✅ Control pompa air via WhatsApp commands (`hidup`, `mati`, `status`)
- ✅ Auto-stop pompa saat tangki air penuh (water level sensor)
- ✅ WebSocket communication dengan ESP32 (real-time)
- ✅ OTA firmware update support untuk ESP32 (over WiFi)
- ✅ WhatsApp menggunakan Baileys (gratis, tanpa API key)
- ✅ Session persistence (tidak perlu scan QR setiap restart)
- ✅ Docker containerization dengan Cloudflare Tunnel (secure public access)
- ✅ Responsive alerts dengan emojis untuk clarity

## 🛠️ Teknologi

- **Node.js 20** - Server runtime
- **Express** - Web framework
- **Baileys** - WhatsApp Web API (unofficial)
- **WebSockets** - Real-time ESP32 communication
- **Docker** - Container orchestration
- **Cloudflare Tunnel** - Secure public access (free)
- **ESP32** - Microcontroller dengan relay + water sensor

---

## 🚀 Quick Start

### ⚡ Option 1: Docker (Recommended - Production)

**Prerequisites:**
- Docker & Docker Compose
- Cloudflare account (free)

**Setup:**

```bash
# 1. Setup Cloudflare Tunnel (one-time setup)
chmod +x setup-cloudflare.sh
./setup-cloudflare.sh
# Follow interactive prompts untuk login Cloudflare

# 2. Copy dan configure environment
cp .env.example .env
nano .env
# Edit: RECIPIENT_NUMBER, GROUP_JID (optional)

# 3. Start services
docker-compose up -d

# 4. Scan WhatsApp QR code
docker-compose logs -f bot-server | grep "SCAN QR"
```

**Hasil:**
- Local access: `http://localhost:3000/status`
- Public access: `https://bot-<account>.cfargotunnel.com` (via Cloudflare)
- ✅ No port expose (secure)
- ✅ Auto-restart on crash
- ✅ WhatsApp session persists

**Commands:**
```bash
# View logs
docker-compose logs -f bot-server

# Stop services
docker-compose down

# Rebuild if needed
docker-compose up -d --build
```

---

### 💻 Option 2: Manual Development (Local)

**Prerequisites:**
- Node.js v18+
- npm

**Setup:**

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env dengan text editor favorit

# 3. Start server
npm start

# 4. Scan WhatsApp QR code
# QR akan muncul di terminal
# Buka WhatsApp → Linked Devices → Link a Device → Scan
```

**Environment Variables** (`.env`):

```env
# Server
PORT=3000

# WhatsApp
RECIPIENT_NUMBER=628123456789          # No + sign (Indonesia format)
MESSAGE_TEXT=Sensor tersentuh!

# Optional
GROUP_JID=                              # Send alerts to group (format: 123456789-1234567890@g.us)
API_KEY=your-secure-api-key-here        # For API security (generate: openssl rand -hex 32)

# Docker/Cloudflare (hanya untuk docker setup)
CLOUDFLARE_TOKEN=                       # Auto-filled oleh setup-cloudflare.sh
```

**Mendapat nomor WhatsApp format:**
- Indonesia: `628123456789` (tanpa tanda +)
- US: `12145551234`
- Lainnya: `<country_code><number>`

---

## 📡 API Endpoints

### GET `/`
Info server.
```bash
curl http://localhost:3000/
```

### GET `/status`
Status koneksi.
```bash
curl http://localhost:3000/status
```
Response:
```json
{
  "whatsapp": "connected",
  "esp32": "connected"
}
```

### GET `/qr`
Display WhatsApp QR code (HTML page).
```bash
# Buka di browser
http://localhost:3000/qr
```

### GET `/logout`
Logout WhatsApp bot.
```bash
curl http://localhost:3000/logout
```

### GET `/relogin`
Force re-login WhatsApp.
```bash
curl http://localhost:3000/relogin
```

---

## 🎮 WhatsApp Commands

User dapat mengirim pesan ke bot dengan commands:

| Command | Effect |
|---------|--------|
| `hidup` | Hidupkan pompa (jika air kosong) |
| `mati` | Matikan pompa |
| `status` | Tampilkan status sistem |
| `!hidup` | (Group chat) Sama seperti `hidup` |
| `!mati` | (Group chat) Sama seperti `mati` |
| `!status` | (Group chat) Sama seperti `status` |

**Response Bot:**
- ✅ Pump ON: `⚡ Mesin air hidup!`
- ✅ Pump OFF: `🛑 Mesin air mati!`
- ⚠️ Water full: `⚠️ TANDON PENUH! Pompa telah dimatikan otomatis`
- ❌ ESP32 offline: `❌ ESP32 Offline!`

---

## 🔧 ESP32 Firmware Setup

### Konfigurasi WiFi
Edit `esp-firmware/src/main.cpp`:
```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
```

### Server Address
```cpp
const char* SERVER_HOST = "192.168.1.16";  // IP bot-server
const int SERVER_PORT = 3000;
```

### Upload ke ESP32
```bash
# Via PlatformIO
cd esp-firmware
platformio run --target upload

# Or klik Upload button di VS Code
```

### Monitor Serial Output
```bash
platformio device monitor
```

Expected output:
```
✅ WiFi connected: 192.168.1.50
✅ mDNS started: esp32-pompa-air.local
✅ OTA Ready!
✅ WebSocket connected
✅ System Ready!
```

---

## 🐳 Docker Architecture

```
Internet
   │
   └─→ Cloudflare Tunnel (secure)
       │
       ├─→ https://bot-<account>.cfargotunnel.com
       │
       └─→ Docker Compose Network (internal, private)
           │
           ├─ Service 1: bot-server (Node.js)
           │  ├─ Port: 3000 (internal only)
           │  ├─ Volume: auth_info_baileys (persist WhatsApp session)
           │  └─ Cmd: npm start
           │
           └─ Service 2: cloudflared (tunnel)
              ├─ Connects to: bot-server:3000
              ├─ Token: from CLOUDFLARE_TOKEN env
              └─ Cmd: cloudflared tunnel run
```

**Benefits:**
- ✅ Clean isolation (bot + tunnel)
- ✅ No direct port expose
- ✅ Persistent data (WhatsApp session)
- ✅ Auto-restart on crash
- ✅ Easy scaling

---

## 📁 Project Structure

```
bot-server/
├── index.js                    # Main server
├── package.json                # Dependencies
├── .env.example                # Environment template
├── Dockerfile                  # Bot container
├── docker-compose.yml          # Orchestration (bot + tunnel)
├── .dockerignore               # Files to exclude from image
├── setup-cloudflare.sh         # Tunnel setup script
├── auth_info_baileys/          # WhatsApp session (persisted)
│   ├── creds.json
│   ├── app-state-sync-*.json
│   └── pre-key-*.json
└── README.md                   # This file
```

---

## 🧪 Testing

### Test Locally
```bash
# 1. Start server (development)
npm start

# 2. Open QR endpoint di browser
http://localhost:3000/qr

# 3. Scan QR code dengan WhatsApp
# Pilih nomor untuk linked device

# 4. Test command via terminal
curl http://localhost:3000/status

# 5. Send test message dari WhatsApp
# Type "status" → bot akan respond
```

### Test dengan Docker
```bash
# 1. Start services
docker-compose up -d

# 2. Check status
docker-compose ps

# 3. View logs
docker-compose logs -f

# 4. Test endpoints
curl http://localhost:3000/status
curl https://bot-<account>.cfargotunnel.com/status
```

---

## 🔒 Security

### API Key (Optional)
Generate secure API key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add ke `.env`:
```env
API_KEY=your_generated_key_here
```

### Cloudflare Tunnel
- ✅ Automatic HTTPS/SSL
- ✅ DDoS protection included
- ✅ No IP expose
- ✅ Token stored di environment (.env), tidak di code

### Best Practices
- ❌ Jangan commit `.env` file
- ❌ Jangan share CLOUDFLARE_TOKEN
- ❌ Jangan expose PORT 3000 ke internet (use tunnel)
- ✅ Keep dependencies updated: `npm audit fix`

---

## 🐛 Troubleshooting

### Docker Issues

**"Port 3000 already in use"**
```bash
# Find container
docker ps | grep 3000

# Stop container
docker stop <container_id>

# Or use different port di docker-compose.yml
```

**"WhatsApp session expired"**
```bash
# Clean auth folder
docker-compose down -v
docker-compose up -d
# Scan QR code lagi
```

**"Cloudflare tunnel not connecting"**
```bash
# Check token
cat .env | grep CLOUDFLARE_TOKEN

# Check tunnel status
docker-compose logs cloudflared

# Re-setup tunnel
./setup-cloudflare.sh
```

### Manual Setup Issues

**"QR code not appearing"**
```bash
# Check if WhatsApp process stuck
pkill -f "node index.js"

# Restart
npm start
```

**"Cannot connect to ESP32"**
```bash
# Check WebSocket server running
curl http://localhost:3000/status

# Check ESP32 IP di same network
ping 192.168.1.50  # (sesuaikan IP)

# Check Serial Monitor untuk ESP32 output
```

**"Module not found"**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## 📝 Commands Reference

### Start Services
```bash
# Development
npm start

# Docker
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Maintenance
```bash
# Update dependencies
npm update

# Audit security
npm audit

# Fix vulnerabilities
npm audit fix

# Check logs
pm2 logs  # (if using PM2)
```

### Cloudflare
```bash
# Check tunnel status
cloudflared tunnel list

# View tunnel info
cloudflared tunnel info bot-server

# Delete tunnel (careful!)
cloudflared tunnel delete bot-server
```

---

## 📚 Resources

- **Baileys**: https://github.com/WhiskeySockets/Baileys
- **Express**: https://expressjs.com
- **Cloudflare Tunnel**: https://developers.cloudflare.com/cloudflare-one/connections/connect-applications/
- **Docker**: https://docs.docker.com
- **WebSockets**: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

---

## 📜 License

ISC

---

## 🙋 Support

Issues? Check:
1. Logs: `docker-compose logs -f` atau `npm start` output
2. WiFi connection: `ping <esp32_ip>`
3. QR code: Visit `http://localhost:3000/qr`
4. Status: `curl http://localhost:3000/status`

---

**Last Updated:** 26 Feb 2026
**Version:** 4.2.0 (with Docker + Cloudflare Tunnel support)
