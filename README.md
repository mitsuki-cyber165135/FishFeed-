# FishFeed — Website Monitoring & Kontrol Pakan Ikan

Dashboard web untuk memantau persediaan pakan dan mengendalikan alat pemberi pakan ikan otomatis berbasis ESP32. Proyek PBL **Sistem Instrumentasi Berbasis Internet (SIBI)** — Kelompok 4, Paralel 2.

Website berjalan **tanpa build step dan tanpa framework** (HTML + CSS + JavaScript murni), sehingga cukup dibuka di browser. Komunikasi dengan perangkat fisik melalui **MQTT**.

---

## Fitur

| Halaman | Isi |
|---|---|
| **Overview** | Persediaan pakan + bilah progres, kartu "Pemberian Berikutnya" dengan hitung mundur live, ringkasan pakan hari ini, kontrol manual (slider + input), jadwal hari ini |
| **Histori** | Tabel + filter (mode/rentang/status), grafik SVG Target vs Aktual, panel detail per pemberian, ekspor CSV |
| **Jadwal** | Tambah/edit/hapus jadwal dengan validasi inline |
| **Web-CLI** | Terminal perintah: `feed`, `schedule`, `status`, `tare`, `calibrate`, `stop`, `help` |
| **Pengaturan** | Profil perangkat & budidaya, batas pakan, notifikasi, tema (gelap/terang/ikuti perangkat), MQTT, reset data |
| **Status & keselamatan** | Banner offline, banner stok menipis, peringatan melewati target, panel kesehatan perangkat (Load Cell/HX711/Motor/Jaringan/RSSI), dukungan `prefers-reduced-motion` |

Tambahan:

- **Command palette** (`Ctrl+K`) — pindah halaman, beri pakan, tambah jadwal, ekspor CSV
- **Simulator ESP32** (`simulator.html`) — perangkat palsu berbasis browser untuk demo tanpa hardware
- **Mode realtime MQTT** — bisa dimatikan untuk memakai simulasi lokal sepenuhnya

---

## Menjalankan

Tidak perlu instalasi apa pun.

```bash
# jalankan server statis lokal (disarankan)
python -m http.server 8000
```

Lalu buka <http://localhost:8000/index.html>.

> Membuka `index.html` langsung lewat `file://` juga bisa, tetapi server lokal lebih bebas dari pembatasan browser.

**Untuk mencoba mode realtime (2 tab):**

1. Tab 1: buka `index.html` → Pengaturan → **Mode realtime (MQTT)** → aktifkan
2. Tab 2: buka `simulator.html` (bertindak sebagai ESP32 palsu; publish status tiap 3 detik dan membalas perintah)
3. Beri pakan dari dashboard, lihat prosesnya di kedua tab

Login dashboard memakai gerbang sisi klien — username dan password didefinisikan di `script.js` (cari `AUTH_USER`). Ini **bukan** keamanan sungguhan, hanya menghalau orang iseng yang menemukan URL-nya.

---

## Struktur Repo

```
.
├── index.html          # Dashboard utama
├── script.js           # Logika dashboard (state, UI, MQTT, simulasi)
├── styles.css          # Tema gelap & terang, token desain
├── simulator.html      # Simulator ESP32 di browser (tanpa Node/npm)
├── feeder/
│   ├── platformio.ini      # Konfigurasi PlatformIO
│   └── src/
│       ├── feeder.ino          # Firmware ESP32
│       ├── secrets.example.h   # Template kredensial WiFi (di-commit)
│       └── secrets.h           # Kredensial asli (di-gitignore, tidak ada di repo)
├── PRD ... .md         # Dokumen kebutuhan produk
├── DEMO-CHECKLIST.md   # Panduan demo
└── .vercelignore       # File yang tidak ikut deploy ke Vercel
```

File lama yang tidak lagi dipakai (`app.js`, `style.css`, `extra.css`, `index (file lama).html`, `updated (1).txt`) disimpan sebagai arsip.

---

## Firmware ESP32

Hardware: Load Cell → **HX711** → ESP32 → driver **A4988/DRV8825** → motor **NEMA17**. Board: **ESP32 Dev Module**.

### Setup kredensial WiFi

`secrets.h` **tidak ada di repo** karena berisi password WiFi Anda. Buat sendiri:

```bash
cp feeder/src/secrets.example.h feeder/src/secrets.h
```

Lalu isi di `feeder/src/secrets.h`:

```cpp
const char* WIFI_SSID = "NAMA_WIFI_ANDA";   // harus 2.4 GHz — ESP32 tidak mendukung 5 GHz
const char* WIFI_PASS = "PASSWORD_WIFI_ANDA";
```

### Build & upload

Buka folder `feeder/` di VS Code dengan ekstensi **PlatformIO IDE**:

| Aksi | Shortcut |
|---|---|
| Build | `Ctrl+Alt+B` |
| Upload | `Ctrl+Alt+U` |
| Serial Monitor | `Ctrl+Alt+S` |

Library (`PubSubClient`, `ArduinoJson` v7, `HX711`) diunduh otomatis dari `platformio.ini`.

---

## Topik MQTT

Broker default: `broker.emqx.io` (publik, tanpa auth). Browser memakai **WSS 8084**, ESP32 memakai **TCP 1883** — broker sama, topik tersambung.

`{id}` = ID perangkat (default `demo-01`, harus sama di firmware dan dashboard).

| Topik | Arah | Isi |
|---|---|---|
| `feeder/{id}/status` | ESP32 → web | `{online, weight_kg, motor, rssi, ts}` (retained) |
| `feeder/{id}/event` | ESP32 → web | `{id, ts, mode, target, actual, status, duration, stock_after, samples}` |
| `feeder/{id}/cmd` | web → ESP32 | `{id, cmd, ...}` |
| `feeder/{id}/cmd/reply` | ESP32 → web | `{id, ok, message}` |
| `feeder/{id}/schedule` | dua arah | `[{id, name, time, gram, days, on}]` (retained) |

---

## Deploy

Deploy statis ke **Vercel** — `.vercelignore` sudah mengatur agar hanya dashboard dan simulator yang publik. Firmware, dokumen, dan presentasi tidak ikut ter-deploy.

---

## Hak Cipta

© 2026 Joseph. **Tanpa lisensi** — semua hak dilindungi. Kode ini dipublikasikan untuk keperluan penilaian dan portofolio; tidak ada izin untuk penggunaan ulang, distribusi, atau modifikasi tanpa izin tertulis.
