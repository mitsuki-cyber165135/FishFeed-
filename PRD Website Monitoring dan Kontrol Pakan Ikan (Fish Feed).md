# PRD Website Monitoring dan Kontrol Pakan Ikan (Fish Feed)

Kelompok 4 Paralel 2, Sistem Instrumentasi Berbasis Internet, Departemen Fisika IPB

Status: Draft 1 untuk disepakati kelompok. Bagian bertanda **Asumsi** perlu dikonfirmasi sebelum mulai membangun.

## Ringkasan

Fish Feed adalah feeder ikan otomatis berbasis ESP32 yang menakar pakan dengan load cell dan HX711, lalu menyalurkannya dengan motor stepper NEMA 17. Proposal saat ini hanya menyediakan Web-CLI lewat HTTP server di ESP32, sehingga hanya bisa diakses dari jaringan lokal. Website yang dibahas di dokumen ini menambahkan tiga hal: akses dari internet, dashboard monitoring yang mudah dibaca, dan Web-CLI yang tetap tersedia sebagai pusat kontrol berbasis perintah.

Sasaran utama website: peternak dapat memeriksa stok pakan, memberi pakan, mengatur jadwal, dan melihat riwayat pemberian dari mana saja, dengan tampilan yang modern, responsif, dan interaktif.

## Latar Belakang dan Masalah

- Pemberian pakan manual tidak konsisten dalam takaran dan jadwal, sehingga memicu overfeeding atau pakan kurang.
- Web-CLI di ESP32 hanya bisa dipakai dari WiFi yang sama, sedangkan mata kuliah menuntut sistem instrumentasi berbasis internet.
- Antarmuka berbasis teks saja sulit dipakai untuk memantau tren, stok pakan, dan status perangkat sekilas pandang.

## Tujuan dan Indikator Keberhasilan

| Tujuan | Indikator |
| --- | --- |
| Pengguna dapat memantau perangkat dari internet | Status perangkat dan stok pakan tampil dengan keterlambatan kurang dari 3 detik setelah ESP32 mengirim data |
| Pengguna dapat memberi pakan manual dari jarak jauh | Perintah feed sampai ke ESP32 dan konfirmasi hasil kembali ke dashboard dalam kurang dari 5 detik, di luar waktu motor berputar |
| Pengguna dapat mengelola jadwal | Jadwal yang ditambah, diubah, dan dihapus tersimpan di perangkat dan tetap ada setelah ESP32 restart |
| Hasil penakaran dapat diaudit | Setiap pemberian tercatat dengan waktu, mode, target gram, aktual gram, dan status |
| Tampilan nyaman di ponsel dan laptop | Semua halaman utama dapat dipakai pada lebar layar 360 px sampai 1440 px tanpa scroll horizontal |

Target teknis dari proposal yang ikut diuji: galat penakaran maksimal 5 persen dari target gram, jadwal terpicu tepat waktu, dan respons perintah di bawah 2 detik pada jaringan normal.

## Di Luar Cakupan (Versi 1)

- Banyak kolam atau banyak perangkat dalam satu akun (disiapkan di struktur data, tetapi tampilan satu perangkat dulu).
- Aplikasi mobile native.
- Rekomendasi pakan berbasis AI. Panel Tips & Insight pada mockup cukup berisi konten statis.
- Pembayaran, multi bahasa, dan manajemen organisasi.

## Pengguna dan Skenario

| Persona | Kebutuhan | Skenario utama |
| --- | --- | --- |
| Peternak (pemilik kolam) | Memastikan ikan makan sesuai jadwal tanpa datang ke kolam | Membuka dashboard di ponsel, melihat pemberian berikutnya, menekan Beri Pakan Sekarang bila perlu |
| Operator atau teknisi | Mengatur jadwal dan kalibrasi, mendiagnosis masalah | Memakai Web-CLI untuk tare, calibrate, dan membaca status sensor |
| Dosen dan penguji | Menilai sistem instrumentasi | Melihat data sensor, riwayat, dan kesehatan perangkat dalam satu layar saat demo |

## Arsitektur Sistem

**Asumsi:** komunikasi internet memakai MQTT dengan broker cloud, karena ESP32 bisa menjadi klien keluar tanpa port forwarding dan website bisa berlangganan lewat WebSocket.

- ESP32 terhubung ke WiFi, lalu ke broker MQTT (misalnya HiveMQ Cloud atau Mosquitto) dengan TLS.
- ESP32 menerbitkan data sensor dan status secara berkala, serta berlangganan topik perintah.
- Website (frontend) berlangganan topik status lewat MQTT over WebSocket, dan mengirim perintah ke topik perintah.
- Layanan database ringan (misalnya Supabase atau Firebase) menyimpan riwayat pemberian, jadwal cadangan, dan akun pengguna.
- HTTP server lokal di ESP32 tetap dipertahankan sebagai mode cadangan saat internet putus, sesuai alur pada proposal (WiFi AP atau STA).

### Usulan Topik MQTT

| Topik | Arah | Isi |
| --- | --- | --- |
| feeder/{id}/status | ESP32 ke web | Online, berat hopper (g), status motor, RSSI, waktu perangkat |
| feeder/{id}/event | ESP32 ke web | Hasil pemberian: id, mode, target, aktual, status, durasi |
| feeder/{id}/cmd | web ke ESP32 | Perintah: feed, schedule, tare, calibrate, stop |
| feeder/{id}/cmd/reply | ESP32 ke web | Balasan setiap perintah, termasuk pesan error untuk perintah tidak valid |
| feeder/{id}/schedule | dua arah | Daftar jadwal terkini (retained) |

Perangkat mengirim status Last Will agar website tahu kapan ESP32 offline.

### Usulan Tech Stack Website

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Framework | Next.js (React) dengan TypeScript | Routing, deploy mudah ke Vercel |
| Styling | Tailwind CSS | Sejalan dengan referensi Tailwind UI |
| Komponen | shadcn/ui | Dialog, sheet, command, toast, tabel, form siap pakai |
| Grafik | Recharts | Terintegrasi baik dengan komponen shadcn |
| Animasi | Framer Motion | Transisi halus, animasi pop up |
| Realtime | MQTT.js lewat WebSocket | Langganan topik langsung dari browser |
| Data dan auth | Supabase (atau Firebase) | Login, riwayat, jadwal |

## Arah Desain dan Referensi

Mockup dashboard pada presentasi Pekan 9 sudah menetapkan arah visual: tema gelap, aksen cyan ke hijau, kartu bersudut membulat, sidebar di kiri, dan panel kesehatan perangkat di kanan. PRD ini mempertahankan arah itu dan menambahkan perilaku interaktif.

| Referensi | Yang diambil |
| --- | --- |
| Shadcn UI Blocks | Struktur dashboard dengan sidebar, kartu statistik, tabel data, dialog, dan command palette |
| Creative Tim Soft UI Dashboard | Kartu lembut dengan bayangan halus, sudut membulat, aksen gradien, ikon di dalam kotak berwarna |
| Tailwind UI Home Screens | Application shell yang rapi, hierarki tipografi, daftar aktivitas, dan susunan kartu ringkasan |

Catatan: referensi dipakai sebagai inspirasi pola dan tata letak. Komponen dan kode dibuat sendiri atau memakai shadcn/ui yang berlisensi terbuka. Kode berbayar dari Tailwind UI atau Creative Tim tidak disalin.

### Prinsip UX

- **Status dulu.** Hal pertama yang terlihat: perangkat online atau offline, sisa pakan, dan pemberian berikutnya.
- **Aksi penting mudah dijangkau, aksi berisiko diberi konfirmasi.** Beri pakan, hapus jadwal, dan kalibrasi memakai dialog konfirmasi.
- **Umpan balik instan.** Setiap aksi menghasilkan toast, animasi progres, atau perubahan status yang terlihat.
- **Tidak pernah diam saat gagal.** Offline, timeout, dan error ditampilkan dengan penjelasan dan langkah lanjutan.
- **Mobile first.** Peternak lebih sering memakai ponsel di dekat kolam.

### Design Token (Usulan)

| Elemen | Nilai |
| --- | --- |
| Latar halaman | Biru-hitam sangat gelap (sekitar #0B1215) |
| Permukaan kartu | Sedikit lebih terang dari latar, border tipis semi transparan |
| Aksen utama | Cyan (sekitar #22D3EE) untuk aksi dan angka penting |
| Aksen sukses | Hijau teal (sekitar #10B981) |
| Aksen peringatan | Kuning amber; bahaya memakai merah |
| Sudut | Radius 12 sampai 16 px untuk kartu, 8 px untuk tombol dan input |
| Tipografi | Font sans modern (misalnya Inter atau Geist), angka besar memakai berat semibold; Web-CLI memakai font monospace |
| Mode terang | Disediakan sebagai opsi di Pengaturan, memakai token yang sama |

## Struktur Halaman

Sidebar mengikuti mockup: Overview, Jadwal Pakan, Histori, Web-CLI, Pengaturan. Pada ponsel, sidebar berubah menjadi bottom navigation atau drawer.

### Login dan Pemilihan Perangkat

- Login email dan password (opsional login Google).
- Setelah login, pengguna langsung masuk ke Overview perangkat terakhir.
- Pairing perangkat memakai ID perangkat dan kode pairing yang tertera di ESP32 (diputuskan di bagian Pertanyaan Terbuka).

### Overview (Monitoring dan Kontrol)

Isi halaman, mengikuti mockup:

- **Persediaan Pakan.** Berat hopper dalam kg, bilah progres terhadap kapasitas, dan lencana status (normal, hampir habis, kosong).
- **Pemberian Berikutnya.** Jam, tanggal, porsi, mode (otomatis), dan hitung mundur.
- **Ringkasan Pakan Hari Ini.** Total gram yang sudah diberikan terhadap target harian, dengan persentase.
- **Kontrol Manual.** Slider dan input angka untuk porsi gram, tombol Beri Pakan Sekarang, catatan bahwa pemberian manual tercatat di histori.
- **Jadwal Hari Ini.** Daftar jadwal dengan penanda sudah dijalankan, tombol Edit.
- **Histori Pemberian (ringkas).** Tiga sampai lima baris terakhir dengan tautan Lihat Semua.
- **Panel kanan.** Info kolam atau ikan (jenis, jumlah, bobot rata-rata, tahap pakan), Tips & Insight, dan Status Perangkat.
- **Status Perangkat.** Load Cell, HX711, Stepper Motor, dan Network, masing-masing dengan indikator normal, siap, atau terhubung.

### Jadwal Pakan

- Daftar jadwal dalam kartu atau tabel: jam, porsi, hari aktif, saklar aktif atau nonaktif.
- Tombol Tambah Jadwal membuka dialog berisi pemilih jam, input gram, dan pilihan hari.
- Validasi: porsi tidak boleh melebihi batas maksimum per pemberian, dan dua jadwal tidak boleh bentrok pada menit yang sama.
- Perubahan dikirim ke ESP32 dan baru dianggap berhasil setelah perangkat membalas.

### Histori

- Tabel dengan kolom waktu, berat akhir, mode (manual atau otomatis), target, aktual, dan status.
- Filter berdasarkan rentang tanggal, mode, dan status; pencarian; unduh CSV.
- Grafik target vs aktual dan total pakan per hari, untuk menunjukkan akurasi penakaran.
- Klik baris membuka panel detail: durasi motor, sampel berat, dan pesan error bila ada.

### Web-CLI

Terminal di dalam browser yang menjadi pusat kontrol berbasis perintah.

| Perintah | Fungsi |
| --- | --- |
| feed --weight 100 | Beri pakan 100 gram sekarang |
| schedule add 07:00 50 | Tambah jadwal |
| schedule list | Lihat jadwal |
| schedule del \<id> | Hapus jadwal |
| status | Tampilkan berat hopper, status motor, dan waktu |
| tare | Nolkan timbangan |
| calibrate \<massa> | Kalibrasi dengan massa acuan |
| stop | Hentikan motor darurat |
| help | Daftar perintah |

Perilaku:

- Riwayat perintah dengan panah atas dan bawah, autocomplete dengan Tab.
- Output berwarna: hijau untuk sukses, merah untuk error, abu untuk info.
- Perintah tidak valid menampilkan pesan error dari perangkat, sesuai alur pada flowchart.
- Perintah berisiko (calibrate, stop) meminta konfirmasi singkat di terminal.
- Konsistensi sintaks: dokumen proposal dan slide masih menulis feed – weight 100 dengan tanda hubung panjang. Website memakai satu bentuk baku, yaitu `feed --weight 100`, dan proposal perlu disamakan.

### Pengaturan

- Profil perangkat: nama, lokasi, jenis ikan, jumlah, bobot rata-rata, jenis pakan.
- Batas pakan: porsi maksimum per pemberian, target harian, ambang peringatan stok.
- Notifikasi: pakan hampir habis, perangkat offline, pemberian gagal.
- Keamanan: ganti password, daftar sesi aktif.
- Tampilan: tema gelap atau terang.

## Interaksi, Pop Up, dan Animasi

| Pemicu | Komponen | Perilaku |
| --- | --- | --- |
| Tekan Beri Pakan Sekarang | Dialog konfirmasi | Menampilkan porsi, estimasi durasi, dan stok setelah pemberian; tombol Konfirmasi dan Batal |
| Konfirmasi pemberian | Dialog progres | Cincin atau bilah progres gram aktual terhadap target secara langsung, tombol Stop Darurat, berubah menjadi centang saat selesai |
| Selesai atau gagal | Toast | Pesan singkat di pojok layar; yang gagal memuat tombol Coba Lagi |
| Tambah atau ubah jadwal | Dialog atau sheet formulir | Validasi langsung di bawah input, tombol Simpan aktif hanya jika valid |
| Hapus jadwal | Dialog peringatan | Menyebut jadwal yang akan dihapus |
| Stok di bawah ambang | Banner dan lencana | Kartu Persediaan Pakan berubah warna amber atau merah, pop up satu kali per sesi |
| Perangkat offline | Banner di atas halaman | Semua tombol aksi dinonaktifkan dengan tooltip penjelasan |
| Tekan Ctrl+K atau ikon pencarian | Command palette | Pindah halaman, mengisi perintah Web-CLI, atau membuka dialog beri pakan |
| Klik baris histori | Sheet samping | Detail pemberian |
| Data baru dari ESP32 | Animasi angka dan grafik | Angka berubah halus, titik grafik baru bergeser masuk |
| Pindah halaman | Transisi | Fade dan geser pendek, tidak lebih dari 200 ms |

Animasi menghormati pengaturan prefers-reduced-motion.

## Persyaratan Fungsional

| ID | Persyaratan | Prioritas |
| --- | --- | --- |
| F1 | Pengguna dapat login dan logout | Wajib |
| F2 | Dashboard menampilkan status online atau offline perangkat secara realtime | Wajib |
| F3 | Dashboard menampilkan berat hopper, persentase stok, dan status motor | Wajib |
| F4 | Pengguna dapat memberi pakan manual dengan porsi gram dan konfirmasi | Wajib |
| F5 | Dashboard menampilkan progres pemberian secara langsung dan hasil akhir | Wajib |
| F6 | Pengguna dapat menambah, mengubah, menghapus, dan menonaktifkan jadwal | Wajib |
| F7 | Riwayat pemberian tercatat otomatis dan dapat difilter | Wajib |
| F8 | Web-CLI mendukung seluruh perintah pada tabel perintah | Wajib |
| F9 | Perintah stop menghentikan motor dari website | Wajib |
| F10 | Peringatan stok hampir habis dan perangkat offline | Wajib |
| F11 | Grafik target vs aktual dan total pakan harian | Penting |
| F12 | Unduh riwayat sebagai CSV | Penting |
| F13 | Command palette | Penting |
| F14 | Mode terang | Opsional |
| F15 | Notifikasi push atau email | Opsional |

## Persyaratan Non Fungsional

- **Performa.** Halaman utama termuat di bawah 3 detik pada jaringan 4G; interaksi terasa instan dengan pembaruan optimistis yang dikoreksi setelah balasan perangkat.
- **Keandalan.** Website menampilkan data terakhir yang diketahui beserta cap waktunya saat perangkat offline; perintah tidak pernah dikirim ulang otomatis untuk menghindari pemberian ganda.
- **Keamanan.** Login wajib, koneksi TLS ke broker dan website, kredensial broker per perangkat, perintah hanya diterima dari pengguna pemilik perangkat, serta batas porsi maksimum yang divalidasi di website dan di firmware.
- **Aksesibilitas.** Kontras teks minimal WCAG AA, navigasi keyboard penuh, label pada ikon, ukuran target sentuh minimal 44 px.
- **Responsif.** Titik patah 640, 768, 1024, dan 1280 px.
- **Kompatibilitas.** Chrome, Edge, Firefox, dan Safari versi terbaru.

## Keamanan dan Keselamatan Pakan

- Dua lapis batas porsi: antarmuka menolak input di atas batas, dan firmware menolak ulang.
- Timeout motor di firmware bila berat tidak bertambah, dengan status gagal dikirim ke dashboard.
- Perintah feed membawa id unik agar balasan dan pemberian ganda dapat dicocokkan.
- Perintah stop selalu diprioritaskan dan tidak antre.

## Model Data (Garis Besar)

| Entitas | Bidang utama |
| --- | --- |
| device | id, nama, lokasi, kapasitas hopper, batas porsi, target harian |
| pond | device\_id, jenis ikan, jumlah, bobot rata-rata, tahap pakan |
| schedule | id, device\_id, jam, gram, hari aktif, aktif |
| feed\_log | id, device\_id, waktu, mode, target\_g, aktual\_g, status, durasi\_s, pesan |
| alert | id, device\_id, jenis, waktu, dibaca |
| user | id, email, peran |

## Rencana Pengujian dan Kriteria Penerimaan

- Pemberian manual 50, 100, dan 150 gram diulang minimal 5 kali; galat rata-rata dan maksimum dicatat dan ditampilkan di grafik Histori.
- Jadwal yang dibuat dari website terpicu di perangkat pada menit yang benar, termasuk setelah ESP32 di-restart.
- Menekan Beri Pakan Sekarang dua kali beruntun tidak menghasilkan dua pemberian.
- Mencabut internet dari ESP32 membuat dashboard menampilkan offline dalam waktu yang disepakati dan menonaktifkan tombol aksi.
- Semua halaman utama lolos pemeriksaan tampilan pada 360, 768, dan 1440 px.
- Skor Lighthouse performa dan aksesibilitas di atas 85 pada halaman Overview.

## Tahapan Pengerjaan

| Tahap | Isi | Keluaran |
| --- | --- | --- |
| 1 | Finalisasi PRD, keputusan broker dan database, wireframe | PRD final, wireframe Overview dan Web-CLI |
| 2 | Kerangka aplikasi, login, layout sidebar, token desain | Aplikasi kosong dengan navigasi |
| 3 | Koneksi MQTT dan halaman Overview dengan data nyata atau simulasi | Dashboard realtime |
| 4 | Beri pakan, dialog, progres, toast, jadwal | Kontrol manual dan jadwal berfungsi |
| 5 | Histori, grafik, Web-CLI | Fitur lengkap versi 1 |
| 6 | Pengujian, perbaikan, dokumentasi, deploy | Demo untuk dosen |

Selama firmware belum siap, website dapat memakai simulator ESP32 sederhana (skrip yang menerbitkan data palsu ke broker) agar pengembangan website dan firmware berjalan paralel.

## Pertanyaan Terbuka

1. Apakah kelompok setuju memakai MQTT dengan broker cloud, atau lebih memilih Cloudflare Tunnel ke HTTP server ESP32?
2. Database yang dipakai: Supabase atau Firebase?
3. Berapa kapasitas hopper dan batas porsi maksimum per pemberian?
4. Satu perangkat atau lebih untuk demo?
5. Bagaimana pairing perangkat dilakukan: ID tercetak, QR code, atau diisi manual?
6. Panel Tips & Insight berisi artikel statis atau tautan literatur yang dipilih kelompok?
7. Siapa yang mengerjakan frontend, firmware, dan pengujian?
