# ESP32 Touch to WhatsApp Bot

Bot server untuk mengirim notifikasi WhatsApp saat sensor sentuh (touch sensor) pada ESP32 terdeteksi.

## 📋 Fitur

- ✅ Koneksi WhatsApp menggunakan Baileys (gratis, tanpa API key)
- ✅ REST API endpoint untuk menerima notifikasi dari ESP32
- ✅ Auto-reconnect jika koneksi terputus
- ✅ Session persistence (tidak perlu scan QR setiap restart)
- ✅ Debounce 3 detik untuk mencegah spam notifikasi

## 🛠️ Teknologi

- **Node.js** - Server runtime
- **Express** - Web framework
- **Baileys** - WhatsApp Web API
- **ESP32** - Microcontroller dengan touch sensor

## 📦 Instalasi

### 1. Install Dependencies

```bash
cd bot-server
npm install
```

### 2. Konfigurasi Environment

Edit file `.env` dan sesuaikan:

```env
PORT=3000
RECIPIENT_NUMBER=628123456789  # Ganti dengan nomor WhatsApp tujuan
MESSAGE_TEXT=Sensor tersentuh!
```

**Format nomor:**
- Indonesia: `628123456789` (tanpa tanda +)
- Negara lain: `<kode_negara><nomor>` (contoh: `1234567890` untuk US)

## 🚀 Cara Menjalankan

### 1. Start Bot Server

```bash
npm start
```

atau

```bash
node index.js
```

### 2. Scan QR Code

Saat pertama kali dijalankan, aplikasi akan menampilkan QR code di terminal:

```
========================================
Scan QR Code ini dengan WhatsApp Anda:
========================================
[QR CODE AKAN MUNCUL DI SINI]
========================================
```

**Cara scan:**
1. Buka WhatsApp di ponsel Anda
2. Tap menu (titik tiga) → **Linked Devices**
3. Tap **Link a Device**
4. Scan QR code yang muncul di terminal

### 3. Tunggu Koneksi Berhasil

Jika berhasil, akan muncul pesan:

```
✅ WhatsApp terhubung!
```

**Session akan otomatis tersimpan**, jadi tidak perlu scan QR lagi saat restart server (kecuali logout manual).

## 📡 API Endpoints

### POST `/notify`

Kirim notifikasi WhatsApp.

**Request:**
```bash
curl -X POST http://localhost:3000/notify
```

Atau dengan custom message:
```bash
curl -X POST http://localhost:3000/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Custom message disini"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Notifikasi WhatsApp terkirim",
  "recipient": "628123456789",
  "text": "Sensor tersentuh!"
}
```

### GET `/status`

Cek status koneksi.

```bash
curl http://localhost:3000/status
```

**Response:**
```json
{
  "whatsapp": "connected",
  "server": "running",
  "recipient": "628123456789"
}
```

### GET `/`

Info API.

```bash
curl http://localhost:3000/
```

## 🔧 Konfigurasi ESP32 Firmware

### 1. Edit Konfigurasi WiFi

Buka file `esp-firmware/src/main.cpp` dan edit:

```cpp
// GANTI dengan kredensial WiFi Anda
const char* WIFI_SSID = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";
```

### 2. Edit URL Server

Cari IP address komputer yang menjalankan bot-server:

**Linux/Mac:**
```bash
ip addr show  # atau ifconfig
```

**Windows:**
```cmd
ipconfig
```

Kemudian edit di `main.cpp`:

```cpp
// GANTI dengan IP address komputer
const char* SERVER_URL = "http://192.168.1.100:3000/notify";
```

### 3. Upload Firmware ke ESP32

Di VS Code dengan PlatformIO:
1. Hubungkan ESP32 ke komputer via USB
2. Klik tombol **Upload** (→) di PlatformIO toolbar
3. Tunggu upload selesai

Atau via terminal:
```bash
cd esp-firmware
platformio run --target upload
```

### 4. Monitor Serial Output

Buka Serial Monitor untuk melihat status:

```bash
platformio device monitor
```

Output yang diharapkan:
```
========================================
ESP32 Touch to WhatsApp Notification
========================================
Menghubungkan ke WiFi...
SSID: NamaWiFi
...........
✅ WiFi Terhubung!
IP Address: 192.168.1.50
========================================

Sistem siap!
Sentuh pin untuk mengirim notifikasi WhatsApp
========================================
```

## 🧪 Testing

### 1. Test Manual dari Terminal

```bash
curl -X POST http://localhost:3000/notify
```

Anda harus menerima pesan WhatsApp.

### 2. Test dari ESP32

1. Pastikan bot-server berjalan
2. Pastikan ESP32 terhubung WiFi (cek Serial Monitor)
3. Sentuh GPIO 4 (Touch Pin T0) dengan jari
4. LED built-in akan menyala
5. Serial Monitor akan menampilkan:
   ```
   Touch Value: 15 [TOUCHED] -> Mengirim notifikasi WhatsApp...
   ✅ Notifikasi terkirim! Response code: 200
   ```
6. Cek WhatsApp, seharusnya ada pesan masuk

## 🔍 Troubleshooting

### QR Code tidak muncul

- Pastikan tidak ada karakter ansi/warna yang mengganggu terminal
- Coba restart server: `node index.js`

### WhatsApp selalu disconnect

- Pastikan koneksi internet stabil
- Jangan logout dari WhatsApp di ponsel
- Session tersimpan di folder `auth_info_baileys/`, jangan hapus folder ini

### ESP32 tidak bisa terhubung WiFi

- Periksa SSID dan password WiFi
- ESP32 hanya support WiFi 2.4GHz (tidak support 5GHz)
- Pastikan WiFi tidak hidden
- Cek Serial Monitor untuk pesan error

### Notifikasi tidak terkirim dari ESP32

- Periksa IP address server di `SERVER_URL` sudah benar
- Pastikan ESP32 dan komputer di jaringan WiFi yang sama
- Test manual dengan curl dari komputer lain
- Cek firewall tidak memblokir port 3000

### Touch sensor terlalu sensitif/tidak sensitif

Edit nilai `THRESHOLD` di `main.cpp`:

```cpp
#define THRESHOLD 40  // Turunkan jika kurang sensitif, naikkan jika terlalu sensitif
```

Lihat nilai real-time di Serial Monitor untuk kalibrasi.

### Spam notifikasi terus-menerus

Debounce sudah diatur 3 detik. Jika masih spam:
- Periksa threshold touch sensor
- Naikkan `DEBOUNCE_DELAY` di main.cpp (default 3000ms)

## 📁 Struktur Project

```
bot-server/
├── index.js              # Main server file
├── package.json          # Dependencies
├── .env                  # Environment variables (JANGAN di-commit!)
├── .gitignore           # Git ignore rules
└── auth_info_baileys/   # WhatsApp session (auto-generated, JANGAN di-commit!)

esp-firmware/
├── src/
│   └── main.cpp         # ESP32 firmware code
├── platformio.ini       # PlatformIO configuration
└── ...
```

## 🔐 Security Notes

- ⚠️ File `.env` berisi konfigurasi sensitif, **JANGAN commit ke Git**
- ⚠️ Folder `auth_info_baileys/` berisi session WhatsApp, **JANGAN commit ke Git**
- ⚠️ Untuk production, tambahkan authentication di API endpoint
- ⚠️ Gunakan HTTPS jika deploy ke internet

## 📝 License

ISC

## 🤝 Contributing

Pull requests are welcome!

## 📧 Support

Jika ada masalah, buka issue di repository ini.
