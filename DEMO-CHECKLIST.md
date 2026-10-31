# Checklist Demo FishFeed — Kelompok 4

> Cetak/buka di HP. Urutan sudah diuji terhadap alur firmware & dashboard.

---

## 0. Hotspot (cek PALING AWAL)

| Cek | Kenar |
|---|---|
| Hotspot **"joseph"** menyala | SSID sudah tertanam di firmware |
| Band **2.4 GHz** aktif | ESP32 **tidak bisa** 5 GHz — ini penyebab #1 "WiFi tidak ketemu" |
| Limit perangkat **2** | Laptop + ESP32. Limit 1 = ESP32 tidak dapat internet |
| Smart/auto-off hotspot **dimatiin** | HP bisa mematikan hotspot saat nganggur |
| Baterai HP cukup / tetap dicas | Hotspot + demo 20 menit ≈ 15–20% baterai |

---

## 1. Sebelum hari-H (sekali saja, di rumah)

- [ ] Install library Arduino IDE: **PubSubClient**, **ArduinoJson v7**, **HX711** (bogde). `Preferences` sudah bawaan.
- [ ] Board: **ESP32 Dev Module**.
- [ ] Cek di `feeder.ino`: `WIFI_SSID = "joseph"`, `WIFI_PASS = "joseph06"`, `DEVICE_ID = "demo-01"`.
- [ ] **Compile** — harus lolos. Kalau error, catat pesannya.
- [ ] **Flash** ke ESP32.
- [ ] Buka Serial Monitor **115200** → harus muncul `[wifi] terhubung` lalu `[mqtt] terhubung`.
- [ ] Buka `index.html` → Pengaturan → **Mode realtime (MQTT)** ON, broker `wss://broker.emqx.io:8084/mqtt`, ID `demo-01`.
- [ ] Overview: stok terisi dari alat → **tes `feed` 100 g** → masuk Histori.
- [ ] **Kalibrasi** (lihat bagian 2) lalu tes ulang akurasi.

---

## 2. Kalibrasi (wajib sebelum menilai akurasi)

Target PRD: galat ≤ 5%. Tanpa ini angkanya ngawur.

1. Kosongkan hopper.
2. Dashboard → Web-CLI → ketik `tare` → Enter.
3. Taruh **massa acuan yang diketahui** di atas load cell (mis. air 500 g / anak timbangan).
4. Web-CLI → `calibrate 500` (sesuai massa acuan) → jawab `y`.
5. Lepas beban, cek `status` — harus mendekati 0 g.
6. Tes: `feed 100` → bandingkan target vs aktual di Histori.

> Kalau hasil timbang masih jauh: ulangi `tare` → `calibrate` dengan massa acuan **lebih besar** (semakin berat, semakin akurat).

---

## 3. Urutan saat demo (± 10 menit)

| # | Aksi | Yang harus terlihat |
|---|---|---|
| 1 | Nyalakan hotspot "joseph" | — |
| 2 | Nyalakan ESP32 | Serial: `[wifi] terhubung` → `[mqtt] terhubung` |
| 3 | Laptop buka `index.html` | Dashboard tampil |
| 4 | Pengaturan → Mode MQTT **ON** | Toast "Terhubung ke broker MQTT" |
| 5 | Kembali ke Overview | Status **Online**, stok = isi hopper, RSSI terisi |
| 6 | Jelaskan kartu Persediaan + Pemberian Berikutnya + hitung mundur | Angka live |
| 7 | **Beri Pakan Sekarang** (100 g) → Konfirmasi | Dialog progres → motor berputar → centang → toast |
| 8 | Buka Histori | Baris baru: target 100 g vs aktual |
| 9 | Web-CLI → `status`, lalu `help` | Output berwarna, autocomplete Tab |
| 10 | Tambah jadwal baru di **Jadwal Pakan** | Tersimpan & tersinkron ke alat |
| 11 | **Uji offline**: matikan hotspot | Banner merah "Perangkat tidak terhubung", tombol aksi nonaktif |
| 12 | Nyalakan hotspot lagi | Status kembali Online sendiri (auto-reconnect) |

**Poin bicara saat langkah 11:** sistem menampilkan data terakhir + cap waktu, dan menolak perintah — tidak pernah diam saat gagal (sesuai PRD).

---

## 4. Kalau ada masalah (baca Serial Monitor)

### Kode `[mqtt] gagal rc=…`

| rc | Arti | Solusi |
|---|---|---|
| `-2` | Tidak bisa capai broker | ESP32 belum punya internet → cek hotspot |
| `-4` | Timeout | Sinyal lemah → dekatkan ke HP |
| `-1` / `-3` | Terputus | Normal sementara, auto-reconnect |
| `5` | Not authorized | Broker minta auth → pakai broker tanpa login |
| `4` | Bad credentials | Hapus username/password di dashboard |

### Gejala lain

| Gejala | Cek |
|---|---|
| WiFi tidak ketemu | Hotspot 5 GHz → **pindah ke 2.4 GHz** |
| Online tapi stok 0 terus | Kalibrasi belum jalan / HX711 tidak terbaca (`[cal]`) |
| Dashboard tetap Offline | `DEVICE_ID` di firmware ≠ ID di Pengaturan |
| Feed jalan tapi tidak masuk Histori | Payload terlalu besar → pastikan `setBufferSize(1024)` ada |
| Jadwal tidak terpicu | Jam belum sinkron NTP (butuh internet) |
| Motor berputar tapi pakan tidak turun | Mekanik/hopper — bukan software |

---

## 5. Rencana cadangan (wajib ada)

Kalau hardware bermasalah di tengah demo:

1. Buka **`simulator.html`** → **Hubungkan**.
2. Dashboard tetap di Mode MQTT dengan ID yang sama.
3. Semua fitur tetap bisa didemokan (feed, jadwal, offline, CLI).

Alat gagal ≠ demo gagal. Katakan: *"Ini simulator perangkat dengan protokol MQTT identik"* — dan itu memang benar.

---

## 6. Angka yang perlu dihafal

| Parameter | Nilai |
|---|---|
| Kapasitas hopper | 2.00 kg |
| Target harian | 480 g |
| Porsi maksimal | 250 g |
| Jadwal default | 07:00 / 12:00 / 17:00 / 21:00 · 120 g |
| Broker | `broker.emqx.io` (ESP32 TCP 1883 · browser WSS 8084) |
| Device ID | `demo-01` |
| Serial Monitor | 115200 baud |
