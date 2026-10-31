/* =====================================================================
   FishFeed — aplikasi dashboard (vanilla JS, tanpa build step)
   ===================================================================== */
"use strict";

/* ---------- Utilitas ---------- */
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const rnd = (a, b) => Math.random() * (b - a) + a;
const round1 = (n) => Math.round(n * 10) / 10;
const niceCeil = (v) => { if (v <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const DAYS_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const fmtDate = (d) => `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtClock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dowIdx = (d) => (d.getDay() + 6) % 7; // 0 = Senin
const at = (time, base = new Date()) => { const [h, m] = time.split(":").map(Number); const d = new Date(base); d.setHours(h, m, 0, 0); return d; };
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? "baru saja" : s < 3600 ? `${Math.floor(s / 60)} mnt lalu` : s < 86400 ? `${Math.floor(s / 3600)} jam lalu` : `${Math.floor(s / 86400)} hari lalu`; };

/* ---------- Data referensi ---------- */
const SPECIES = {
  tilapia: { name: "Tilapia (Nila)", short: "Tilapia", rec: [4, 6] },
  catfish: { name: "Lele (Catfish)", short: "Lele", rec: [2, 3] },
  carp: { name: "Mas (Common Carp)", short: "Mas", rec: [6, 6] },
};
const speciesOpts = () => Object.entries(SPECIES).map(([k, v]) => [k, v.name]);

const ARTICLES = [
  { id: "freq", tag: "FREKUENSI PAKAN", topic: "Frekuensi pakan", title: "Feeding frequency and stocking density: tilapia, catfish and carp", src: "Scientific African", year: "Jul 2021",
    url: "https://doaj.org/article/78ed2b8e99cd4af2a1d5a0395bd27022",
    sum: "Tinjauan lebih dari 70 studi: rentang optimal 4–6×/hari untuk tilapia, 6× untuk mas, dan 2–3× untuk lele." },
  { id: "ctrl", tag: "KUALITAS AIR", topic: "Kualitas air", title: "Feeding control and water quality monitoring in aquaculture systems", src: "arXiv", year: "2023",
    url: "https://arxiv.org/pdf/2306.09920",
    sum: "Frekuensi, waktu, dan laju pemberian pakan serta kaitannya dengan kualitas air dan pertumbuhan ikan." },
  { id: "meta", tag: "STRATEGI", topic: "Strategi pakan", title: "Optimization of feeding strategies in aquaculture: a meta-analysis", src: "Aquahoy", year: "2025",
    url: "https://aquahoy.com/optimization-feeding-strategies-aquaculture-meta-analysis/",
    sum: "Frekuensi pakan memengaruhi pertumbuhan; titik optimal bergantung spesies dan kondisi budidaya." },
];

/* ---------- State & penyimpanan ---------- */
const KEY = "fishfeed-v2";
const DEFAULTS = {
  device: { name: "Kolam Nila A", location: "Tambak Sukabumi", capacityKg: 2, maxPortion: 250, dailyTarget: 480, lowThreshold: 20 },
  pond: { species: "tilapia", stage: "Grow-out", system: "Freshwater pond", population: 1200, avgWeight: 85, feedType: "Pellet" },
  schedule: [
    { id: 1, name: "Pakan Pagi", time: "07:00", gram: 120, days: [0, 1, 2, 3, 4, 5, 6], on: true },
    { id: 2, name: "Pakan Siang", time: "12:00", gram: 120, days: [0, 1, 2, 3, 4, 5, 6], on: true },
    { id: 3, name: "Pakan Sore", time: "17:00", gram: 120, days: [0, 1, 2, 3, 4, 5, 6], on: true },
    { id: 4, name: "Pakan Malam", time: "21:00", gram: 120, days: [0, 1, 2, 3, 4, 5, 6], on: true },
  ],
  history: [], alerts: [], fired: [],
  stockKg: 1.28, lastSync: Date.now(), rssi: -58,
  settings: { theme: "dark", notifLow: true, notifOver: true, notifOffline: true, notifFail: true, userName: "Peternak", farmName: "Fish Farm", offlineSim: false },
  mqtt: { mode: false, broker: "wss://broker.emqx.io:8084/mqtt", user: "", pass: "", deviceId: "demo-01" },
  seeded: false, lowWarned: false, aid: 0, nid: 0,
};

function deepMerge(base, over) {
  const out = { ...base };
  for (const k in over) {
    const b = base[k], o = over[k];
    out[k] = (o && typeof o === "object" && !Array.isArray(o) && b && typeof b === "object") ? deepMerge(b, o) : o;
  }
  return out;
}
function load() {
  try { const r = JSON.parse(localStorage.getItem(KEY)); if (r) return deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), r); } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULTS));
}
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

function isOnline() { return S.mqtt.mode ? !!(mqttClient && mqttClient.connected) && mqttDeviceOnline : !S.settings.offlineSim; }
const dis = () => (isOnline() ? "" : "disabled");
const disCls = () => (isOnline() ? "" : "is-disabled");

/* ---------- Turunan ---------- */
const todayGram = () => { const k = dayKey(new Date()); return S.history.filter(h => dayKey(new Date(h.t)) === k).reduce((a, h) => a + h.actual, 0); };
const totalPlanned = () => S.schedule.filter(s => s.on).reduce((a, s) => a + s.gram, 0);
const findSch = (id) => S.schedule.find(s => s.id === +id);

function nextFeeding(now) {
  let best = null, bestS = null;
  S.schedule.filter(s => s.on).forEach(s => {
    const [h, m] = s.time.split(":").map(Number);
    for (let off = 0; off < 8; off++) {
      const d = new Date(now); d.setDate(d.getDate() + off); d.setHours(h, m, 0, 0);
      if (s.days.includes(dowIdx(d)) && d > now) { if (!best || d < best) { best = d; bestS = s; } break; }
    }
  });
  return { t: best, s: bestS };
}

function genSamples(target, actual) {
  const n = 8, arr = [];
  for (let i = 1; i <= n; i++) { const f = i / n; arr.push({ t: i, w: round1(Math.min(actual, target * f) + (i === n ? 0 : rnd(-0.5, 0.5))) }); }
  return arr;
}

/* ---------- Seed & markPassed ---------- */
function seed() {
  const now = new Date();
  const rows = [];
  const add = (t, target, mode) => rows.push({ id: ++S.aid, t: t.getTime(), mode, target, actual: round1(target + rnd(-2, 2)), status: "ok", duration: Math.round(rnd(3, 8)), note: "", samples: genSamples(target, target + rnd(-2, 2)) });
  [1, 0].forEach(off => {
    S.schedule.forEach(s => {
      const d = new Date(now); d.setDate(d.getDate() - off);
      const [h, m] = s.time.split(":").map(Number); d.setHours(h, m, 0, 0);
      if (off === 0 && d > now) return;
      if (!s.days.includes(dowIdx(d))) return;
      add(d, s.gram, "auto");
    });
  });
  const man = new Date(now); man.setDate(man.getDate() - 1); man.setHours(14, 36, 0, 0);
  add(man, 80, "manual");
  S.history = rows.sort((a, b) => b.t - a.t).slice(0, 300);
  // tandai jadwal hari ini yang sudah lewat agar tidak tereksekusi dua kali
  const ti = dowIdx(now), dk = dayKey(now);
  S.schedule.forEach(s => { if (s.on && s.days.includes(ti) && at(s.time) <= now) S.fired.push(`${dk}#${s.id}`); });
  S.seeded = true;
}
function markPassed() {
  const now = new Date(), ti = dowIdx(now), dk = dayKey(now);
  S.schedule.forEach(s => { if (s.on && s.days.includes(ti) && at(s.time) <= now) { const k = `${dk}#${s.id}`; if (!S.fired.includes(k)) S.fired.push(k); } });
  S.fired = S.fired.slice(-120);
}

/* ---------- Notifikasi & toast ---------- */
function notify(type, title, text, link) {
  S.alerts.unshift({ id: ++S.nid, type, title, text, link, t: Date.now(), read: false });
  S.alerts = S.alerts.slice(0, 20);
  save(); renderNotifs();
}
function toast(title, type = "info", msg = "") {
  const IC = { ok: "check_circle", warn: "warning", error: "error", info: "info" };
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.innerHTML = `<span class="material-symbols-rounded">${IC[type] || "info"}</span>
    <div class="toast-tx"><strong>${esc(title)}</strong>${msg ? `<span>${esc(msg)}</span>` : ""}</div>
    <button class="toast-close" aria-label="Tutup"><span class="material-symbols-rounded">close</span></button>`;
  const dismiss = () => { clearTimeout(timer); t.classList.add("leaving"); setTimeout(() => t.remove(), 220); };
  t.querySelector(".toast-close").onclick = dismiss;
  const timer = setTimeout(dismiss, 4800);
  $("#toastRoot").append(t);
}

/* ---------- Modal ---------- */
const MODALS = [];
function openModal(o) {
  const back = document.createElement("div");
  back.className = "modal-backdrop";
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <button class="modal-x" aria-label="Tutup"><span class="material-symbols-rounded">close</span></button>
    <div class="modal-head"><div class="m-icon"><span class="material-symbols-rounded"></span></div><div><h3></h3><p></p></div></div>
    <div class="modal-body"></div><div class="modal-foot"></div></div>`;
  const box = back.querySelector(".modal");
  let done = false, resolve;
  const closed = new Promise(r => (resolve = r));
  const api = { box, closed, close, update, dismissable: () => o.dismissable !== false };
  function close(v) { if (done) return; done = true; const i = MODALS.indexOf(api); if (i >= 0) MODALS.splice(i, 1); back.style.opacity = "0"; setTimeout(() => { back.remove(); resolve(v); }, 170); }
  function update(n) {
    o = { ...o, ...n };
    box.dataset.tone = o.tone || "";
    box.querySelector(".m-icon .material-symbols-rounded").textContent = o.icon || "info";
    box.querySelector(".modal-head h3").textContent = o.title || "";
    const sub = box.querySelector(".modal-head p"); sub.textContent = o.subtitle || ""; sub.style.display = o.subtitle ? "" : "none";
    box.querySelector(".modal-body").innerHTML = o.body || "";
    box.querySelector(".modal-x").style.display = o.dismissable === false ? "none" : "";
    const foot = box.querySelector(".modal-foot"); foot.innerHTML = "";
    (o.actions || []).forEach(a => {
      const b = document.createElement("button");
      b.className = "btn " + (a.cls || "");
      b.innerHTML = (a.icon ? `<span class="material-symbols-rounded">${a.icon}</span>` : "") + `<span>${esc(a.label)}</span>`;
      b.onclick = () => { const r = a.onClick && a.onClick(box, api); if (r !== false) close(a.value); };
      foot.append(b);
    });
    foot.style.display = (o.actions || []).length ? "" : "none";
  }
  box.querySelector(".modal-x").onclick = () => close();
  back.addEventListener("mousedown", e => { if (e.target === back && api.dismissable()) close(); });
  update({});
  MODALS.push(api);
  $("#modalRoot").append(back);
  setTimeout(() => { const f = box.querySelector("input,select,textarea"); if (f) f.focus(); }, 120);
  return api;
}
const confirm = (o) => openModal({ icon: o.icon || "help", tone: o.tone, title: o.title, body: o.body, actions: [{ label: o.cancelText || "Batal", value: false }, { label: o.okText || "Konfirmasi", cls: "primary", value: true }] }).closed.then(v => !!v);
function closeTopModal() { const m = MODALS[MODALS.length - 1]; if (m && m.dismissable()) { m.close(); return true; } return false; }

/* ---------- Side sheet (detail) ---------- */
const SHEETS = [];
function openSheet(title, bodyHtml) {
  const back = document.createElement("div");
  back.className = "sheet-backdrop";
  back.innerHTML = `<div class="sheet"><div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Tutup"><span class="material-symbols-rounded">close</span></button></div><div class="sheet-body">${bodyHtml}</div></div>`;
  const close = () => { const i = SHEETS.indexOf(close); if (i >= 0) SHEETS.splice(i, 1); back.remove(); };
  back.querySelector("[data-close]").onclick = close;
  back.addEventListener("mousedown", e => { if (e.target === back) close(); });
  SHEETS.push(close);
  $("#sheetRoot").append(back);
  return close;
}
function closeTopSheet() { const c = SHEETS[SHEETS.length - 1]; if (c) { c(); return true; } return false; }

/* ---------- Tema ---------- */
function applyTheme() {
  const m = S.settings.theme;
  const dark = m === "dark" || (m === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.body.classList.toggle("light", !dark);
  const ic = $("#themeBtn .material-symbols-rounded");
  if (ic) ic.textContent = dark ? "light_mode" : "dark_mode";
}
$("#themeBtn").addEventListener("click", () => { const dark = !document.body.classList.contains("light"); S.settings.theme = dark ? "light" : "dark"; save(); applyTheme(); });

/* ---------- Render: header, perangkat, notifikasi, banner, panel kanan ---------- */
function renderHeader() {
  const s = S.settings;
  $("#profileName").textContent = s.userName; $("#profileFarm").textContent = s.farmName;
  $("#ddName").textContent = s.userName; $("#ddFarm").textContent = s.farmName;
}
function renderDeviceCard() {
  const on = isOnline();
  $("#deviceCard").innerHTML = `<div class="dc-head"><span>Perangkat</span><span class="pill ${on ? "ok" : "bad"}"><span class="dot"></span>${on ? "Online" : "Offline"}</span></div>
    <div class="device-row"><span class="dr-ic material-symbols-rounded">router</span><div class="dr-tx"><strong>${esc(S.device.name)}</strong><small>ESP32 · RSSI ${on ? S.rssi + " dBm" : "—"}</small></div></div>`;
}
const NT_ICON = { ok: "check_circle", warn: "warning", error: "error", info: "info" };
function renderNotifs() {
  const un = S.alerts.filter(n => !n.read).length;
  $("#notifBadge").hidden = !un;
  $("#notifCount").textContent = un ? `${un} belum dibaca` : "Semua dibaca";
  $("#notifList").innerHTML = S.alerts.length ? S.alerts.map(n => `<button class="notif-row ${n.read ? "" : "unread"}" data-act="open-notif" data-id="${n.id}">
      <span class="notif-ic ${n.type} material-symbols-rounded">${NT_ICON[n.type]}</span>
      <span class="notif-tx"><strong>${esc(n.title)}</strong><small>${esc(n.text)}</small><em>${ago(n.t)}</em></span></button>`).join("") : `<p class="empty">Tidak ada notifikasi.</p>`;
}
function renderBanners() {
  const b = $("#lowStockBanner");
  const low = S.stockKg / S.device.capacityKg * 100 < S.device.lowThreshold && S.stockKg > 0.005;
  b.hidden = !low;
  if (low) b.innerHTML = `<span class="material-symbols-rounded">inventory_2</span><div class="banner-text"><strong>Stok pakan menipis</strong><span>Sisa ${S.stockKg.toFixed(2)} kg (${Math.round(S.stockKg / S.device.capacityKg * 100)}%). Segera isi ulang.</span></div><button class="btn sm" data-act="stock-modal">Isi ulang</button>`;
}
let _prevOnline;
function applyOfflineState() {
  const on = isOnline();
  document.body.classList.toggle("is-offline", !on);
  $("#offlineBanner").hidden = on;
  const ci = $("#cliIn"); if (ci) ci.disabled = !on;
  if (on !== _prevOnline) { _prevOnline = on; renderAll(); }
}

function renderRightPanel() {
  const p = S.pond, sp = SPECIES[p.species];
  $("#farmProfileSection").innerHTML = `<div class="r-head"><div><span class="ch-label">PROFIL BUDIDAYA</span><h3>Profil Kolam</h3></div><button class="icon-btn" data-act="go" data-v="pengaturan" title="Ubah"><span class="material-symbols-rounded">edit</span></button></div>
    <div class="farm-card"><div class="fish-ic"><span class="material-symbols-rounded">set_meal</span></div><div><strong>${sp.short} · ${p.stage}</strong><small>${p.system}</small></div></div>
    <div class="kv-grid">
      <div><span>Populasi</span><strong>${Number(p.population).toLocaleString("id-ID")} ekor</strong></div>
      <div><span>Bobot rata-rata</span><strong>${p.avgWeight} g</strong></div>
      <div><span>Jenis pakan</span><strong>${esc(p.feedType)}</strong></div>
      <div><span>Lokasi</span><strong>${esc(S.device.location)}</strong></div>
    </div>`;

  const n = S.schedule.filter(s => s.on).length, [lo, hi] = sp.rec;
  const ok = n >= lo && n <= hi;
  const msg = ok ? `Jadwal Anda (${n}×/hari) sudah sesuai.` : n < lo ? `Jadwal Anda ${n}×/hari — pertimbangkan menambah sesi.` : `Jadwal Anda ${n}×/hari — di atas rentang tersebut.`;
  const main = ARTICLES[0];
  $("#tipSection").innerHTML = `<div class="r-head"><div><span class="ch-label">TIPS & INSIGHT</span><h3>Rekomendasi</h3></div></div>
    <div class="tip ${ok ? "" : "warn"}"><span class="material-symbols-rounded">${ok ? "task_alt" : "tips_and_updates"}</span><p><strong>${sp.name}: ${lo}–${hi}×/hari</strong> (Scientific African, 2021). ${msg}</p></div>
    <article class="article-card"><div class="article-thumb"><span class="tag">${main.tag}</span></div>
      <div class="article-body"><h4>${esc(main.title)}</h4><p>${esc(main.sum)}</p>
        <div class="article-meta"><span>${main.year}</span><span>${main.src}</span></div>
        <div class="article-foot"><button class="link-btn" data-act="art-sum" data-id="${main.id}">Ringkasan</button><a href="${main.url}" target="_blank" rel="noopener noreferrer">Buka artikel<span class="material-symbols-rounded">arrow_outward</span></a></div>
      </div></article>`;

  const on = isOnline();
  const items = [
    ["scale", "Load Cell", on ? "Normal" : "—", on ? "ok" : "bad"],
    ["memory", "HX711", on ? "Normal" : "—", on ? "ok" : "bad"],
    ["rotate_right", "Stepper Motor", on ? "Siap" : "—", on ? "ok" : "bad"],
    ["wifi", "Jaringan", on ? "Terhubung" : "Terputus", on ? "ok" : "bad"],
    ["signal_cellular_alt", "RSSI", on ? S.rssi + " dBm" : "—", on ? "ok" : "bad"],
  ];
  $("#healthSection").innerHTML = `<div class="r-head"><div><span class="ch-label">KESEHATAN PERANGKAT</span><h3>Status Perangkat</h3></div></div>
    <div class="health-list">${items.map(([ic, name, s, c]) => `<div class="health-item"><div class="health-name"><span class="material-symbols-rounded">${ic}</span>${name}</div><span class="health-state ${c}">${s}</span></div>`).join("")}</div>`;
}

/* ---------- Render: Overview ---------- */
let sliderGram = 100;
function updateFeedHint() {
  const el = $("#feedHint"); if (!el) return;
  const g = sliderGram, overStock = g > S.stockKg * 1000, overTarget = todayGram() + g > S.device.dailyTarget;
  if (overStock) el.className = "hint danger"; el.innerHTML = overStock
    ? `<span class="material-symbols-rounded">error</span><p>Porsi <strong>${g} g</strong> melebihi sisa pakan (<strong>${Math.round(S.stockKg * 1000)} g</strong>).</p>`
    : overTarget
      ? `<span class="material-symbols-rounded">warning</span><p>Total hari ini akan melewati <strong>target ${S.device.dailyTarget} g</strong> (${todayGram() + g} g).</p>`
      : `<span class="material-symbols-rounded">info</span><p>Pemberian manual akan dicatat sebagai <strong>manual feeding</strong> pada histori.</p>`;
  if (overTarget) el.className = "hint danger";
}
function renderStock() {
  const el = $("#stockCard"); if (!el) return;
  const pct = Math.round(S.stockKg / S.device.capacityKg * 100);
  const low = pct < S.device.lowThreshold, empty = S.stockKg <= 0.005;
  const state = empty ? ["Kosong", "bad"] : low ? ["Hampir habis", "warn"] : ["Normal", "ok"];
  el.innerHTML = `<div class="card-head"><div><span class="ch-label">PERSEDIAAN PAKAN</span><h3>Persediaan Pakan</h3></div><div class="chip-icon green"><span class="material-symbols-rounded">scale</span></div></div>
    <div class="metric"><span class="stat-value">${S.stockKg.toFixed(2)}</span><span class="unit">kg</span></div>
    <div class="bar ${low ? "warn" : ""}" style="margin-top:14px"><i style="width:${Math.min(100, pct)}%"></i></div>
    <div class="card-foot"><span>Kapasitas ${S.device.capacityKg.toFixed(2)} kg</span><span class="pill ${state[1]}"><span class="dot"></span>${state[0]}</span></div>`;
}
function renderNextFeeding() {
  const el = $("#nextFeeding"); if (!el) return;
  const now = new Date(), nf = nextFeeding(now);
  if (!nf.t) { el.innerHTML = `<div class="card-head"><div><span class="ch-label">PEMBERIAN BERIKUTNYA</span><h3>Pemberian Berikutnya</h3></div><div class="chip-icon"><span class="material-symbols-rounded">calendar_clock</span></div></div><div class="metric"><span class="stat-value">--:--</span></div><div class="card-foot">Tidak ada jadwal aktif</div>`; return; }
  const diff = Math.max(0, Math.floor((nf.t - now) / 1000));
  const cd = `${pad(Math.floor(diff / 3600))}:${pad(Math.floor((diff % 3600) / 60))}:${pad(diff % 60)}`;
  el.innerHTML = `<div class="card-head"><div><span class="ch-label">PEMBERIAN BERIKUTNYA</span><h3>Pemberian Berikutnya</h3></div><div class="chip-icon"><span class="material-symbols-rounded">calendar_clock</span></div></div>
    <div class="metric"><span class="stat-value">${pad(nf.t.getHours())}:${pad(nf.t.getMinutes())}</span></div>
    <div class="card-foot" style="margin-top:2px"><span>${fmtDate(nf.t)}</span></div>
    <div class="grid-2" style="margin-top:14px">
      <div class="glow-item"><span class="material-symbols-rounded">restaurant</span><div><small>Porsi</small><strong>${nf.s.gram} g</strong></div></div>
      <div class="glow-item"><span class="material-symbols-rounded">autorenew</span><div><small>Mode</small><strong>Otomatis</strong></div></div>
    </div>
    <div class="card-foot" style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,.14)"><span>Pakan dalam</span><strong>${cd}</strong></div>`;
}
function renderDaily() {
  const el = $("#dailyCard"); if (!el) return;
  const g = Math.round(todayGram()), t = S.device.dailyTarget;
  const pct = Math.round(g / t * 100), over = g > t;
  const ti = dowIdx(new Date()), dk = dayKey(new Date());
  const totalSes = S.schedule.filter(s => s.on && s.days.includes(ti)).length;
  const doneSes = S.fired.filter(k => k.startsWith(dk + "#")).length;
  el.innerHTML = `<div class="card-head"><div><span class="ch-label">HARI INI</span><h3>Ringkasan Pakan</h3></div><div class="chip-icon amber"><span class="material-symbols-rounded">analytics</span></div></div>
    <div class="metric"><span class="stat-value">${g}</span><span class="unit">gram</span></div>
    <div class="bar ${over ? "warn" : ""}" style="margin-top:14px"><i style="width:${Math.min(100, pct)}%;background:${over ? "var(--red)" : "var(--grad)"}"></i></div>
    <div class="card-foot"><span>${g} / ${t} g target</span><span>${doneSes} dari ${totalSes} sesi</span></div>`;
}
function renderTodaySchedule() {
  const el = $("#todayTimeline"); if (!el) return;
  const now = new Date(), ti = dowIdx(now), dk = dayKey(now);
  const list = S.schedule.filter(s => s.days.includes(ti)).sort((a, b) => a.time.localeCompare(b.time));
  if (!list.length) { el.innerHTML = `<p class="empty">Tidak ada jadwal untuk hari ini.</p>`; return; }
  const upcoming = list.filter(s => s.on && !S.fired.includes(`${dk}#${s.id}`) && at(s.time) > now);
  const nextId = upcoming.length ? upcoming[0].id : null;
  el.innerHTML = `<div class="timeline">${list.map(s => {
    const fired = S.fired.includes(`${dk}#${s.id}`);
    const cls = !s.on ? "off" : fired ? "done" : (s.id === nextId ? "now" : "");
    const ic = !s.on ? "block" : fired ? "check_circle" : "schedule";
    const state = !s.on ? "Nonaktif" : fired ? "Selesai" : "Terjadwal";
    return `<div class="tl-item ${cls}"><div class="tl-time">${s.time}</div><div class="tl-dot"><i></i></div>
      <div class="tl-content"><strong>${esc(s.name)}</strong><small>${s.gram} g · Otomatis</small></div><span class="tl-state">${state}</span></div>`;
  }).join("")}</div>`;
}
const histRow = (h) => { const d = new Date(h.t); return `<tr data-act="open-detail" data-id="${h.id}"><td><strong>${fmtClock(d)}</strong><small>${fmtDate(d)}</small></td><td>${h.mode === "auto" ? '<span class="tag auto"><span class="material-symbols-rounded">autorenew</span>Otomatis</span>' : '<span class="tag manual"><span class="material-symbols-rounded">touch_app</span>Manual</span>'}</td><td>${h.target} g</td><td>${h.actual.toFixed(1)} g</td><td>${h.status === "ok" ? '<span class="tag ok"><span class="material-symbols-rounded">check_circle</span>Sukses</span>' : '<span class="tag bad"><span class="material-symbols-rounded">error</span>Gagal</span>'}</td></tr>`; };
function renderRecent() {
  const el = $("#recentTable"); if (!el) return;
  const rows = S.history.slice(0, 5);
  el.innerHTML = `<table class="table"><thead><tr><th>Waktu</th><th>Mode</th><th>Target</th><th>Aktual</th><th>Status</th></tr></thead><tbody>${rows.map(histRow).join("") || `<tr><td colspan="5" class="empty">Belum ada riwayat.</td></tr>`}</tbody></table>`;
}

function renderOverview() {
  const el = $("#view-overview");
  el.innerHTML = `<div class="page-intro">
      <div><h2>Monitoring &amp; Kontrol</h2><p>Pantau ketersediaan pakan dan kendalikan pemberian pakan otomatis maupun manual dari jarak jauh.</p></div>
      <div class="last-sync" id="lastSync"><span class="material-symbols-rounded">sync</span><span><strong>--</strong> <span class="ls-rel">· --</span></span></div>
    </div>
    <div class="grid-3">
      <div class="card" id="stockCard"></div>
      <div class="card glow" id="nextFeeding"></div>
      <div class="card" id="dailyCard"></div>
    </div>
    <div class="grid-2 section">
      <div class="card">
        <div class="card-head"><div><span class="ch-label">KONTROL MANUAL</span><h3>Beri Pakan Sekarang</h3></div><div class="chip-icon cyan"><span class="material-symbols-rounded">touch_app</span></div></div>
        <div class="weight-display"><div class="num"><span id="wNum">${sliderGram}</span><small>gram</small></div></div>
        <div class="range-labels"><span>10 g</span><span>${S.device.maxPortion} g</span></div>
        <input type="range" id="feedSlider" min="10" max="${S.device.maxPortion}" step="5" value="${sliderGram}" aria-label="Porsi pakan">
        <div class="hint" id="feedHint" style="margin-top:14px"></div>
        <button class="btn primary lg block" data-act="feed" style="margin-top:14px" ${dis()}><span class="material-symbols-rounded">restaurant</span>Beri Pakan Sekarang</button>
      </div>
      <div class="card">
        <div class="card-head"><div><span class="ch-label">JADWAL HARI INI</span><h3>Jadwal Hari Ini</h3></div><button class="link-btn" data-act="go" data-v="jadwal">Kelola</button></div>
        <div id="todayTimeline"></div>
      </div>
    </div>
    <div class="card section">
      <div class="card-head"><div><span class="ch-label">HISTORI TERBARU</span><h3>Histori Pemberian Pakan</h3></div><button class="link-btn" data-act="go" data-v="histori">Lihat semua</button></div>
      <div class="table-wrap" id="recentTable"></div>
    </div>`;
  sliderGram = Math.max(10, Math.min(sliderGram, S.device.maxPortion));
  renderStock(); renderNextFeeding(); renderDaily(); renderTodaySchedule(); renderRecent(); updateFeedHint();
  const sl = $("#feedSlider");
  if (sl) sl.addEventListener("input", () => { sliderGram = Number(sl.value); $("#wNum").textContent = sliderGram; updateFeedHint(); });
}

/* ---------- Alur pemberian pakan ---------- */
const feedDuration = (g) => Math.round(Math.min(4500, 1800 + g * 8));

async function startManualFeed() {
  const g = sliderGram;
  if (!isOnline()) { toast("Perangkat offline", "error", "Perintah tidak dapat dikirim."); return; }
  if (g > S.stockKg * 1000) {
    openModal({ icon: "inventory_2", tone: "danger", title: "Persediaan tidak cukup",
      body: `<p>Porsi <b>${g} g</b> melebihi sisa pakan <b>${Math.round(S.stockKg * 1000)} g</b>. Isi ulang hopper terlebih dahulu.</p>`,
      actions: [{ label: "Tutup" }, { label: "Atur stok", cls: "primary", onClick: () => { go("jadwal"); setTimeout(stockModal, 60); } }] });
    return;
  }
  const ok = await confirmFeed(g); if (!ok) return;
  if (mqttEnabled()) runMqttFeed(g); else runFeedProgress(g);
}
function confirmFeed(g) {
  const dur = feedDuration(g), after = Math.max(0, S.stockKg - g / 1000);
  const over = todayGram() + g > S.device.dailyTarget;
  return openModal({ icon: "restaurant", tone: "warn", title: "Konfirmasi Pemberian Pakan",
    body: `<div class="confirm-rows">
        <div><span>Porsi pakan</span><strong>${g} g</strong></div>
        <div><span>Estimasi durasi</span><strong>${Math.round(dur / 1000)} detik</strong></div>
        <div><span>Sisa pakan setelah</span><strong>${after.toFixed(2)} kg</strong></div>
      </div>
      ${over ? `<div class="hint danger"><span class="material-symbols-rounded">warning</span><p>Total hari ini akan menjadi <strong>${todayGram() + g} g</strong>, melewati target <strong>${S.device.dailyTarget} g</strong>.</p></div>` : ""}
      <p class="muted" style="margin-top:10px">Perintah akan dikirim ke ESP32 dan dicatat pada histori.</p>`,
    actions: [{ label: "Batal", value: false }, { label: "Konfirmasi", cls: "primary", icon: "check", value: true }] }).closed.then(v => !!v);
}
function feedRingBody(g) {
  const C = 2 * Math.PI * 60;
  return `<div class="feed-progress"><div class="ring"><svg viewBox="0 0 140 140" width="150" height="150"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#10b981"/></linearGradient></defs><circle class="ring-bg" cx="70" cy="70" r="60"></circle><circle class="ring-fill" id="ringFill" cx="70" cy="70" r="60" stroke-dasharray="${C}" stroke-dashoffset="${C}"></circle></svg><div class="ring-num"><div><strong id="ringNum">0</strong><span>dari ${g} g</span></div></div></div><p class="fp-sub" id="fpSub">Feeder berputar, load cell menimbang pakan…</p></div>`;
}
function runFeedProgress(g) {
  const dur = feedDuration(g), C = 2 * Math.PI * 60;
  let stop = false, current = 0;
  const m = openModal({ icon: "restaurant", title: "Memberi pakan", dismissable: false, body: feedRingBody(g),
    actions: [{ label: "Stop Darurat", cls: "danger", icon: "stop_circle", onClick: () => { stop = true; return false; } }] });
  const t0 = performance.now();
  const iv = setInterval(() => {
    if (stop) { clearInterval(iv); return finish(); }
    const p = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    current = Math.round(g * e);
    m.box.querySelector("#ringFill").style.strokeDashoffset = C * (1 - e);
    m.box.querySelector("#ringNum").textContent = current;
    if (p >= 1) { clearInterval(iv); current = g; finish(); }
  }, 40);
  function finish() {
    const actual = stop ? Math.max(1, round1(current + rnd(-1, 0))) : round1(g + rnd(-2, 2));
    recordFeed(g, "manual", { actual, note: stop ? `Dihentikan manual pada ${current} g` : "" });
    renderAll(); applyOfflineState();
    m.update({ icon: "check_circle", tone: "ok", title: stop ? "Pemberian dihentikan" : "Pakan terkirim", dismissable: true,
      body: `<div class="done-mark"><span class="material-symbols-rounded">check_circle</span></div><p style="text-align:center">Berat tertimbang <strong>${actual.toFixed(1)} g</strong> dari target ${g} g.</p>`,
      actions: [{ label: "Selesai", cls: "primary", value: true }] });
    toast(stop ? "Pemberian dihentikan" : "Pakan terkirim", "ok", `${actual.toFixed(1)} g dari target ${g} g.`);
  }
}

/* Pemberian manual via MQTT: kirim perintah, tunggu balasan `event` dari perangkat */
let pendingFeed = null;
function runMqttFeed(g) {
  const id = publishCmd({ cmd: "feed", weight: g });
  if (!id) return;
  const C = 2 * Math.PI * 60;
  let done = false;
  const m = openModal({ icon: "restaurant", title: "Memberi pakan (MQTT)", dismissable: false, body: feedRingBody(g),
    actions: [{ label: "Stop Darurat", cls: "danger", icon: "stop_circle", onClick: () => { publishCmd({ cmd: "stop" }); return false; } }] });
  const sub = m.box.querySelector("#fpSub"); if (sub) sub.textContent = "Menunggu balasan dari ESP32…";
  const t0 = Date.now();
  const timeout = setTimeout(() => { if (!done) { done = true; pendingFeed = null; finish(null, "timeout", "Tidak ada balasan dari perangkat (timeout)."); } }, 12000);
  pendingFeed = {
    cmdId: id,
    reply: (r) => { if (done) return; if (r.ok === false) { done = true; pendingFeed = null; finish(null, "gagal", r.message || "Perangkat menolak perintah."); } },
    resolve: (row) => { if (done) return; done = true; finish(row, row.status === "ok" ? "ok" : "gagal", row.note); },
  };
  const iv = setInterval(() => {
    if (done) { clearInterval(iv); return; }
    const e = Math.min(1, (Date.now() - t0) / 4000), current = Math.round(g * (1 - Math.pow(1 - e, 3)));
    m.box.querySelector("#ringFill").style.strokeDashoffset = C * (1 - e);
    m.box.querySelector("#ringNum").textContent = current;
  }, 60);
  function finish(row, status, msgText) {
    clearTimeout(timeout); clearInterval(iv);
    m.update({ icon: status === "ok" ? "check_circle" : "error", tone: status === "ok" ? "ok" : "danger", title: status === "ok" ? "Pakan terkirim" : "Pemberian gagal", dismissable: true,
      body: status === "ok" ? `<div class="done-mark"><span class="material-symbols-rounded">check_circle</span></div><p style="text-align:center">Berat tertimbang <strong>${row.actual.toFixed(1)} g</strong> dari target ${g} g.</p>` : `<p style="text-align:center">${esc(msgText || "Gagal.")}</p>`,
      actions: [{ label: "Selesai", cls: "primary", value: true }] });
    if (status === "ok") toast("Pakan terkirim", "ok", `${row.actual.toFixed(1)} g dari target ${g} g.`);
    else toast(status === "timeout" ? "Waktu habis" : "Pemberian gagal", "error", msgText || "");
  }
}
function checkLowStock() {
  const low = S.stockKg / S.device.capacityKg * 100 < S.device.lowThreshold;
  if (low && !S.lowWarned) {
    S.lowWarned = true;
    if (S.settings.notifLow) { notify("warn", "Stok pakan menipis", `Sisa ${S.stockKg.toFixed(2)} kg — segera isi ulang.`, "jadwal"); toast("Stok pakan menipis", "warn", `Sisa ${S.stockKg.toFixed(2)} kg.`); }
  } else if (!low) S.lowWarned = false;
}
function recordFeed(target, mode, opts = {}) {
  const actual = opts.actual != null ? opts.actual : round1(target + rnd(-2, 2));
  const before = todayGram();
  S.stockKg = Math.max(0, +(S.stockKg - actual / 1000).toFixed(4));
  S.history.unshift({ id: ++S.aid, t: Date.now(), mode, target, actual, status: opts.status || "ok", duration: opts.duration != null ? opts.duration : Math.round(rnd(3, 8)), note: opts.note || "", samples: genSamples(target, actual) });
  S.history = S.history.slice(0, 300);
  const after = todayGram();
  if (before <= S.device.dailyTarget && after > S.device.dailyTarget && S.settings.notifOver) notify("warn", "Target harian terlewati", `Total hari ini ${after} g dari target ${S.device.dailyTarget} g.`, "histori");
  checkLowStock();
  save();
  return actual;
}

/* ---------- Render: Jadwal ---------- */
function fmtDays(days) { return days.length === 7 ? "Setiap hari" : days.map(i => DAYS_SHORT[i]).join(", "); }
const sel = (kind, opts, value, src) => `<select data-${src}="${kind}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${v}" ${v == value ? "selected" : ""}>${l}</option>`; }).join("")}</select>`;

function pageJadwal() {
  const total = totalPlanned(), pct = Math.round(S.stockKg / S.device.capacityKg * 100);
  const daysTotal = total ? (S.stockKg * 1000 / total).toFixed(1) : "∞";
  const diff = total - S.device.dailyTarget;
  const list = [...S.schedule].sort((a, b) => a.time.localeCompare(b.time));
  $("#view-jadwal").innerHTML = head("MANAJEMEN PAKAN", "Jadwal Pakan", "Atur sesi pemberian otomatis, stok pakan di hopper, dan target pakan harian.") + `
  <div class="grid-side">
    <div class="card">
      <div class="card-head"><div><span class="ch-label">JADWAL PEMBERIAN</span><h3>${list.length} jadwal</h3></div>
        <button class="btn primary sm" data-act="add-sch" ${dis()}><span class="material-symbols-rounded">add</span>Tambah</button></div>
      <div class="sch-list">${list.map(s => `
        <div class="sch-row ${s.on ? "" : "off"}">
          <div class="sch-time">${s.time}</div>
          <div class="sch-info"><strong>${esc(s.name)}</strong><span class="sch-days">${fmtDays(s.days)}</span><span class="sch-meta">${s.gram} g · ${s.on ? "Aktif" : "Nonaktif"}</span></div>
          <div class="sch-actions">
            <label class="switch ${disCls()}" title="${isOnline() ? "Aktif/nonaktif" : "Perangkat offline"}"><input type="checkbox" data-act="toggle-sch" data-id="${s.id}" ${s.on ? "checked" : ""} ${dis()}><i></i></label>
            <button class="icon-btn" data-act="edit-sch" data-id="${s.id}" ${dis()} title="Edit"><span class="material-symbols-rounded">edit</span></button>
            <button class="icon-btn" data-act="del-sch" data-id="${s.id}" ${dis()} title="Hapus"><span class="material-symbols-rounded">delete</span></button>
          </div>
        </div>`).join("") || `<p class="empty">Belum ada jadwal.</p>`}</div>
      <div class="sum-line ${diff > 0 ? "bad" : ""}" style="margin-top:14px">Total jadwal aktif <strong>${total} g/hari</strong> · target <strong>${S.device.dailyTarget} g</strong>. ${diff > 0 ? `Melebihi target ${diff} g.` : diff < 0 ? `Ruang manual ${-diff} g.` : "Pas dengan target."}</div>
    </div>
    <div class="stack">
      <div class="card">
        <div class="card-head"><div><span class="ch-label">PERSEDIAAN PAKAN</span><h3>Stok Hopper</h3></div><div class="chip-icon green"><span class="material-symbols-rounded">inventory_2</span></div></div>
        <div class="metric"><span class="stat-value">${S.stockKg.toFixed(2)}</span><span class="unit">kg dari ${S.device.capacityKg.toFixed(2)} kg</span></div>
        <div class="bar ${pct < S.device.lowThreshold ? "warn" : ""}" style="margin-top:14px"><i style="width:${Math.min(100, pct)}%"></i></div>
        <p class="muted" style="margin-top:12px;font-size:12.5px">${total ? `Cukup untuk sekitar <strong>${daysTotal} hari</strong> pada jadwal aktif.` : "Tidak ada jadwal aktif."}</p>
        <div class="actions-row" style="margin-top:14px"><button class="btn primary" data-act="stock-modal" ${dis()}><span class="material-symbols-rounded">inventory</span>Isi ulang / atur</button></div>
      </div>
      <div class="card">
        <div class="card-head"><div><span class="ch-label">TARGET HARIAN</span><h3>Target Pakan</h3></div><div class="chip-icon amber"><span class="material-symbols-rounded">flag</span></div></div>
        <label class="field"><span>Target per hari (gram)</span><input id="tgtInput" type="number" min="50" max="5000" step="10" value="${S.device.dailyTarget}"></label>
        <p class="form-err" id="tgtErr"></p>
        <div class="actions-row" style="margin-top:8px">
          <button class="btn primary" data-act="target-save" ${dis()}>Simpan target</button>
          <button class="btn" data-act="target-suggest" ${dis()}>Samakan jadwal (${total} g)</button>
        </div>
      </div>
    </div>
  </div>`;
}

function schModal(s) {
  const edit = !!s;
  s = s || { name: "", time: "08:00", gram: 100, days: [0, 1, 2, 3, 4, 5, 6] };
  openModal({ icon: "calendar_clock", title: edit ? "Edit jadwal" : "Tambah jadwal",
    body: `<label class="field"><span>Nama sesi</span><input id="fName" maxlength="24" value="${esc(s.name)}" placeholder="mis. Pakan Pagi"></label>
      <div class="field-row" style="margin-top:12px">
        <label class="field"><span>Waktu</span><input id="fTime" type="time" value="${s.time}"></label>
        <label class="field"><span>Porsi (g)</span><input id="fGram" type="number" min="10" max="${S.device.maxPortion}" step="5" value="${s.gram}"></label>
      </div>
      <div class="field" style="margin-top:12px"><span>Hari aktif</span><div class="chips" id="fDays">${DAYS.map((d, i) => `<button type="button" class="chip ${s.days.includes(i) ? "on" : ""}" data-day="${i}">${DAYS_SHORT[i]}</button>`).join("")}</div></div>
      <p class="form-err" id="fErr"></p>`,
    actions: [{ label: "Batal", value: false }, { label: edit ? "Simpan" : "Tambah", cls: "primary", onClick: (box) => {
      const time = box.querySelector("#fTime").value, gram = Math.round(Number(box.querySelector("#fGram").value));
      const name = box.querySelector("#fName").value.trim() || `Sesi ${time}`;
      const days = [...box.querySelectorAll("#fDays .chip.on")].map(c => +c.dataset.day);
      const err = (m) => { box.querySelector("#fErr").textContent = m; return false; };
      if (!time) return err("Waktu wajib diisi.");
      if (!(gram >= 10 && gram <= S.device.maxPortion)) return err(`Porsi harus 10–${S.device.maxPortion} g.`);
      if (!days.length) return err("Pilih minimal satu hari aktif.");
      if (S.schedule.some(x => x.time === time && x !== s && x.days.some(d => days.includes(d)))) return err("Sudah ada jadwal pada waktu & hari itu.");
      if (edit) Object.assign(s, { name, time, gram, days });
      else S.schedule.push({ id: Math.max(0, ...S.schedule.map(x => x.id)) + 1, name, time, gram, days, on: true });
      markPassed(); save(); renderAll(); mqttSyncSchedule();
      toast(edit ? "Jadwal diperbarui" : "Jadwal ditambahkan", "ok", `${time} · ${gram} g`);
    } }] });
}
function stockModal() {
  openModal({ icon: "inventory_2", title: "Atur persediaan pakan",
    body: `<div class="field-row">
        <label class="field"><span>Stok saat ini (kg)</span><input id="fStock" type="number" min="0" step="0.05" value="${S.stockKg.toFixed(2)}"></label>
        <label class="field"><span>Kapasitas hopper (kg)</span><input id="fCap" type="number" min="0.5" step="0.1" value="${S.device.capacityKg}"></label>
      </div><p class="form-err" id="fErr"></p>`,
    actions: [
      { label: "Batal", value: false },
      { label: "Isi penuh", onClick: (box) => { box.querySelector("#fStock").value = Number(box.querySelector("#fCap").value || S.device.capacityKg).toFixed(2); return false; } },
      { label: "Simpan", cls: "primary", onClick: (box) => {
        const stock = Number(box.querySelector("#fStock").value), cap = Number(box.querySelector("#fCap").value);
        const err = (m) => { box.querySelector("#fErr").textContent = m; return false; };
        if (!(cap >= 0.5)) return err("Kapasitas minimal 0.5 kg.");
        if (!(stock >= 0) || stock > cap) return err("Stok harus 0 sampai kapasitas hopper.");
        S.stockKg = +stock.toFixed(3); S.device.capacityKg = cap; S.lowWarned = false; checkLowStock();
        save(); renderAll(); toast("Persediaan pakan diperbarui", "ok");
      } }] });
}

/* ---------- Render: Histori (dengan grafik SVG) ---------- */
const hf = { mode: "all", range: "all", status: "all" };

function accuracyChart(rows) {
  const data = [...rows].sort((a, b) => a.t - b.t).slice(-30);
  if (data.length < 2) return `<p class="empty">Belum cukup data untuk grafik.</p>`;
  const W = 720, H = 220, L = 44, R = 14, T = 14, B = 30, iw = W - L - R, ih = H - T - B;
  const maxY = niceCeil(Math.max(...data.map(h => Math.max(h.target, h.actual))) * 1.15);
  const x = i => L + i * (iw / (data.length - 1));
  const y = v => T + ih - (v / maxY * ih);
  const line = key => data.map((h, i) => `${x(i).toFixed(1)},${y(h[key]).toFixed(1)}`).join(" ");
  let grid = ""; for (let i = 0; i <= 4; i++) { const v = maxY * i / 4; grid += `<line class="grid-line" x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`; }
  const n = data.length, idx = new Set([0, Math.floor((n - 1) / 2), n - 1]);
  let xlabels = ""; idx.forEach(i => { const d = new Date(data[i].t); xlabels += `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmtClock(d)}</text>`; });
  const pts = key => data.map((h, i) => `<circle cx="${x(i)}" cy="${y(h[key])}" r="3" style="fill:var(--surface);stroke:var(--${key === "target" ? "cyan" : "green"})" stroke-width="2"><title>${h[key]} g</title></circle>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="height:auto;margin-top:8px">${grid}<polyline points="${line("target")}" fill="none" style="stroke:var(--cyan)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/><polyline points="${line("actual")}" fill="none" style="stroke:var(--green)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${pts("target")}${pts("actual")}${xlabels}</svg>`;
}
function dailyChart(rows) {
  const days = [], now = new Date();
  for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days.push({ d, key: dayKey(d), sum: 0 }); }
  rows.forEach(h => { const k = dayKey(new Date(h.t)); const g = days.find(x => x.key === k); if (g) g.sum += h.actual; });
  const maxV = Math.max(10, niceCeil(Math.max(...days.map(x => x.sum)) * 1.15));
  const W = 720, H = 220, L = 40, R = 14, T = 14, B = 30, iw = W - L - R, ih = H - T - B, bw = iw / days.length * 0.6;
  const y = v => T + ih - (v / maxV * ih);
  let grid = ""; for (let i = 0; i <= 4; i++) { const v = maxV * i / 4; grid += `<line class="grid-line" x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`; }
  const bars = days.map((x, i) => { const cx = L + iw * (i + 0.5) / days.length, h = ih * (x.sum / maxV); const today = i === days.length - 1; return `<rect x="${cx - bw / 2}" y="${T + ih - h}" width="${bw}" height="${h}" rx="5" style="fill:${today ? "var(--cyan)" : "var(--emerald)"}" opacity="${today ? 1 : 0.55}"><title>${x.key}: ${Math.round(x.sum)} g</title></rect><text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${today ? "Hari ini" : DAYS_SHORT[dowIdx(x.d)]}</text>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="height:auto;margin-top:8px">${grid}${bars}</svg>`;
}

function pageHistori() {
  let rows = S.history;
  if (hf.mode !== "all") rows = rows.filter(h => h.mode === hf.mode);
  if (hf.range === "today") rows = rows.filter(h => dayKey(new Date(h.t)) === dayKey(new Date()));
  if (hf.status !== "all") rows = rows.filter(h => h.status === hf.status);
  const sum = rows.reduce((a, h) => a + h.actual, 0);
  const dev = rows.length ? rows.reduce((a, h) => a + Math.abs(h.actual - h.target), 0) / rows.length : 0;
  const chip = (k, v, l) => `<button class="chip ${hf[k] === v ? "on" : ""}" data-act="hf" data-k="${k}" data-v="${v}">${l}</button>`;
  $("#view-histori").innerHTML = head("CATATAN PEMBERIAN", "Histori Pakan", "Catatan setiap pemberian pakan otomatis maupun manual, lengkap dengan berat target dan aktual.") + `
  <div class="stats">
    <div class="stat-box"><div class="sb-label">Jumlah sesi</div><div class="sb-value">${rows.length}</div></div>
    <div class="stat-box"><div class="sb-label">Total pakan</div><div class="sb-value">${Math.round(sum)} g</div></div>
    <div class="stat-box"><div class="sb-label">Rata-rata selisih</div><div class="sb-value">${dev.toFixed(2)} g</div></div>
  </div>
  <div class="grid-2 section">
    <div class="card"><div class="card-head"><div><span class="ch-label">AKURASI</span><h3>Target vs Aktual</h3></div><div class="chart-legend"><span class="lg"><span class="sw cyan"></span>Target</span><span class="lg"><span class="sw green"></span>Aktual</span></div></div>${accuracyChart(rows)}</div>
    <div class="card"><div class="card-head"><div><span class="ch-label">TREN</span><h3>Total Pakan per Hari</h3></div></div>${dailyChart(S.history)}</div>
  </div>
  <div class="card section">
    <div class="toolbar">
      <div class="chips">${chip("mode", "all", "Semua mode")}${chip("mode", "auto", "Otomatis")}${chip("mode", "manual", "Manual")}</div>
      <div class="chips">${chip("range", "all", "Semua waktu")}${chip("range", "today", "Hari ini")}</div>
      <div class="chips">${chip("status", "all", "Semua status")}${chip("status", "ok", "Sukses")}${chip("status", "gagal", "Gagal")}</div>
      <div class="chips" style="margin-left:auto">
        <button class="btn sm" data-act="export"><span class="material-symbols-rounded">download</span>CSV</button>
        <button class="btn sm danger" data-act="clear-hist"><span class="material-symbols-rounded">delete_sweep</span>Hapus</button>
      </div>
    </div>
    <div class="table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>Waktu</th><th>Mode</th><th>Target</th><th>Aktual</th><th>Status</th></tr></thead>
      <tbody>${rows.slice(0, 100).map(histRow).join("") || `<tr><td colspan="5" class="empty">Tidak ada data untuk filter ini.</td></tr>`}</tbody></table></div>
  </div>`;
}

function sparkline(samples) {
  const W = 360, H = 80, P = 8;
  const max = Math.max(...samples.map(s => s.w), 1);
  const pts = samples.map((s, i) => `${P + i * (W - 2 * P) / (samples.length - 1)},${H - P - (s.w / max) * (H - 2 * P)}`);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="80" style="background:var(--bg-2);border:1px solid var(--border);border-radius:10px">
    <polyline points="${pts.join(" ")}" fill="none" style="stroke:var(--cyan)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${samples.map((s, i) => { const [x, y] = pts[i].split(","); return `<circle cx="${x}" cy="${y}" r="3" style="fill:var(--surface);stroke:var(--cyan)" stroke-width="2"><title>${s.w} g</title></circle>`; }).join("")}</svg>`;
}
function openDetail(id) {
  const h = S.history.find(x => x.id === +id); if (!h) return;
  const d = new Date(h.t), diff = h.actual - h.target;
  openSheet(`Detail Pemberian · ${fmtClock(d)}`, `
    <div class="confirm-rows">
      <div><span>Waktu</span><strong>${fmtDate(d)} ${fmtTime(d)}</strong></div>
      <div><span>Mode</span><strong>${h.mode === "auto" ? "Otomatis" : "Manual"}</strong></div>
      <div><span>Target</span><strong>${h.target} g</strong></div>
      <div><span>Aktual</span><strong>${h.actual.toFixed(1)} g</strong></div>
      <div><span>Selisih</span><strong>${diff >= 0 ? "+" : ""}${diff.toFixed(1)} g</strong></div>
      <div><span>Durasi motor</span><strong>${h.duration} detik</strong></div>
      <div><span>Status</span><strong>${h.status === "ok" ? "Sukses" : "Gagal"}</strong></div>
    </div>
    ${h.note ? `<div class="hint danger" style="margin-top:12px"><span class="material-symbols-rounded">info</span><p>${esc(h.note)}</p></div>` : ""}
    <h4 style="margin:16px 0 8px;font-size:13px">Sampel berat (load cell)</h4>
    ${sparkline(h.samples)}`);
}

/* ---------- Render: Web-CLI ---------- */
const CLI_COMMANDS = ["help", "status", "stock", "target", "feed", "schedule", "history", "tare", "calibrate", "stop", "time", "theme", "goto", "reboot", "clear"];
const cli = { hist: [], i: 0 };
let cliPending = null;

function print(txt, cls = "") {
  const o = $("#cliOut"); if (!o) return;
  const d = document.createElement("div"); d.className = cls; d.textContent = txt; o.append(d); o.scrollTop = o.scrollHeight;
}
function runCmd(line) {
  if (cliPending) { const fn = cliPending; cliPending = null; line.toLowerCase() === "y" ? fn() : print("Dibatalkan.", "dim"); return; }
  const [c, ...a] = line.split(/\s+/), P = print, C = c.toLowerCase();
  switch (C) {
    case "help":
      ["help                       daftar perintah", "status                     ringkasan perangkat & pakan", "stock                      stok pakan di hopper",
       "target [gram]              lihat / ubah target harian", "feed <gram> [--force]      beri pakan manual", "schedule list|add|del      kelola jadwal",
       "history [n]                n riwayat terakhir", "tare                       nolkan timbangan", "calibrate <massa>          kalibrasi load cell",
       "stop                       hentikan motor darurat", "time                       jam perangkat", "theme <light|dark>         ganti tema",
       "goto <halaman>             overview, jadwal, histori, cli, pengaturan", "reboot                     simulasi restart ESP32", "clear                      bersihkan layar"].forEach(t => P(t));
      break;
    case "status": {
      const act = activeScheduleCount();
      P("ESP32      : online  | WiFi: connected", "ok");
      P(`Load cell  : HX711 normal | Motor: NEMA 17 siap`);
      P(`Stok pakan : ${S.stockKg.toFixed(2)} / ${S.device.capacityKg.toFixed(2)} kg`);
      P(`Hari ini   : ${Math.round(todayGram())} / ${S.device.dailyTarget} g | jadwal aktif: ${act}`);
      break;
    }
    case "stock": P(`${S.stockKg.toFixed(2)} kg dari ${S.device.capacityKg.toFixed(2)} kg (${Math.round(S.stockKg / S.device.capacityKg * 100)}%)`); break;
    case "target":
      if (!a[0]) return P(`Target harian: ${S.device.dailyTarget} g`);
      if (!(+a[0] >= 50 && +a[0] <= 5000)) return P("Gunakan: target <50-5000>", "err");
      S.device.dailyTarget = Math.round(+a[0]); save(); renderAll(); P(`Target harian diubah menjadi ${S.device.dailyTarget} g`, "ok"); break;
    case "feed": {
      const g = parseInt(a.find(x => /^\d+$/.test(x)), 10), force = a.includes("--force");
      if (!(g >= 10 && g <= S.device.maxPortion)) return P(`Gunakan: feed <10-${S.device.maxPortion}> [--force]`, "err");
      if (!isOnline()) return P("Perangkat offline — perintah ditolak.", "err");
      if (g > S.stockKg * 1000) return P(`Stok tidak cukup (${Math.round(S.stockKg * 1000)} g tersisa).`, "err");
      if (Math.round(todayGram()) + g > S.device.dailyTarget && !force) return P(`PERINGATAN: total hari ini ${Math.round(todayGram()) + g} g, melewati target ${S.device.dailyTarget} g. Tambahkan --force.`, "warn");
      if (mqttEnabled()) { const id = publishCmd({ cmd: "feed", weight: g, force }); if (id) P(`Perintah feed dikirim ke ESP32 (${id}).`, "dim"); break; }
      P("Menimbang pakan…", "dim");
      setTimeout(() => { const x = recordFeed(g, "manual"); renderAll(); P(`OK: target ${g} g, aktual ${x.toFixed(1)} g.`, "ok"); }, 900);
      break;
    }
    case "schedule": {
      const sub = a[0];
      if (!sub || sub === "list") { const act = activeSchedule(); act.length ? act.forEach(s => P(`${s.time}  ${String(s.gram).padStart(3)} g  ${s.name}`)) : P("Tidak ada jadwal aktif.", "dim"); break; }
      if (sub === "add") {
        const time = a[1], gram = parseInt(a[2], 10);
        if (!/^\d{2}:\d{2}$/.test(time || "") || !(gram >= 10 && gram <= S.device.maxPortion)) return P(`Gunakan: schedule add HH:MM <10-${S.device.maxPortion}>`, "err");
        if (!isOnline()) return P("Perangkat offline — perintah ditolak.", "err");
        S.schedule.push({ id: Math.max(0, ...S.schedule.map(x => x.id)) + 1, name: `Sesi ${time}`, time, gram, days: [0, 1, 2, 3, 4, 5, 6], on: true });
        markPassed(); save(); renderAll(); mqttSyncSchedule(); P(`Jadwal ${time} (${gram} g) ditambahkan.`, "ok"); break;
      }
      if (sub === "del") { const id = parseInt(a[1], 10); const s = S.schedule.find(x => x.id === id); if (!s) return P("ID tidak ditemukan. Gunakan 'schedule list'.", "err"); S.schedule = S.schedule.filter(x => x.id !== id); save(); renderAll(); mqttSyncSchedule(); P(`Jadwal ${s.time} dihapus.`, "ok"); break; }
      return P("Gunakan: schedule list | add HH:MM gram | del <id>", "err");
    }
    case "history": {
      const n = Math.min(20, parseInt(a[0], 10) || 5);
      S.history.slice(0, n).forEach(h => { const d = new Date(h.t); P(`${fmtDate(d)} ${fmtTime(d)}  ${h.mode.padEnd(6)} ${h.target} g -> ${h.actual.toFixed(1)} g`); });
      break;
    }
    case "tare": if (mqttEnabled()) { publishCmd({ cmd: "tare" }); P("Perintah tare dikirim ke ESP32.", "dim"); } else P("Tare dilakukan — timbangan dinolkan.", "ok"); break;
    case "calibrate": {
      const m = parseFloat(a[0]);
      if (!(m > 0)) return P("Gunakan: calibrate <massa_gram>", "err");
      cliPending = () => { if (mqttEnabled()) { publishCmd({ cmd: "calibrate", mass: m }); P(`Perintah kalibrasi (${m} g) dikirim ke ESP32.`, "dim"); } else P(`Kalibrasi dengan massa acuan ${m} g selesai.`, "ok"); };
      P(`Konfirmasi kalibrasi dengan massa acuan ${m} g? Ketik 'y' untuk lanjut.`, "warn");
      break;
    }
    case "stop": if (mqttEnabled()) { publishCmd({ cmd: "stop" }); P("Perintah stop dikirim ke ESP32.", "dim"); } else P("Motor darurat dihentikan.", "ok"); break;
    case "time": P(new Date().toString()); break;
    case "theme": if (!["light", "dark"].includes(a[0])) return P("Gunakan: theme <light|dark>", "err"); S.settings.theme = a[0]; save(); applyTheme(); P(`Tema: ${a[0]}`, "ok"); break;
    case "goto": if (!VIEWS[a[0]]) return P("Halaman: " + Object.keys(VIEWS).join(", "), "err"); go(a[0]); break;
    case "reboot": P("Restarting ESP32…", "warn"); setTimeout(() => P("Menghubungkan WiFi…", "dim"), 800); setTimeout(() => P("Load cell dikalibrasi ulang.", "dim"), 1600); setTimeout(() => P("ESP32 online.", "ok"), 2400); break;
    case "clear": { const o = $("#cliOut"); if (o) o.innerHTML = ""; break; }
    default: P(`Perintah tidak dikenal: ${c}. Ketik help.`, "err");
  }
}
function pageCli() {
  const v = $("#view-cli");
  if (!v.dataset.ready) {
    v.dataset.ready = "1";
    v.innerHTML = head("KONSOL PERANGKAT", "Web-CLI", "Konsol perintah untuk mengoperasikan feeder. Ketik <b>help</b> untuk daftar perintah.") + `
    <div class="term"><div class="term-bar"><i></i><i></i><i></i><span>esp32@fishfeed ~ console</span></div>
      <div class="term-out" id="cliOut"></div>
      <form class="term-in" id="cliForm"><span>$</span><input id="cliIn" autocomplete="off" spellcheck="false" placeholder="ketik 'help'" ${dis()}></form></div>`;
    const form = $("#cliForm"), inp = $("#cliIn");
    form.addEventListener("submit", e => { e.preventDefault(); const line = inp.value.trim(); inp.value = ""; if (!line) return; cli.hist.push(line); cli.i = cli.hist.length; print("$ " + line, "cmd"); runCmd(line); });
    inp.addEventListener("keydown", e => {
      if (e.key === "ArrowUp" && cli.i > 0) { cli.i--; inp.value = cli.hist[cli.i]; e.preventDefault(); }
      else if (e.key === "ArrowDown") { cli.i = Math.min(cli.hist.length, cli.i + 1); inp.value = cli.hist[cli.i] || ""; e.preventDefault(); }
      else if (e.key === "Tab") { e.preventDefault(); const w = inp.value; const c = CLI_COMMANDS.find(x => x.startsWith(w)); if (c) inp.value = c + " "; }
    });
    v.querySelector(".term").addEventListener("click", () => { if (!window.getSelection().toString()) inp.focus(); });
    print("FishFeed Console v1.0 · ESP32 terhubung", "ok");
    print("Ketik 'help' untuk daftar perintah. Panah atas/bawah untuk riwayat, Tab untuk autocomplete.", "dim");
  }
  const inp = $("#cliIn"); if (inp) inp.focus();
}

/* ---------- Render: Pengaturan ---------- */
function pagePengaturan() {
  const dev = S.device, p = S.pond, st = S.settings;
  $("#view-pengaturan").innerHTML = head("SISTEM & PROFIL", "Pengaturan", "Kelola profil perangkat, batas pakan, notifikasi, tampilan, dan data aplikasi.") + `
  <div class="grid-side">
    <div class="stack">
      <div class="card">
        <div class="card-head"><div><span class="ch-label">PROFIL PERANGKAT</span><h3>Perangkat Feeder</h3></div><div class="chip-icon cyan"><span class="material-symbols-rounded">router</span></div></div>
        <div class="form-grid">
          <label class="field"><span>Nama perangkat</span><input data-dev="name" maxlength="24" value="${esc(dev.name)}"></label>
          <label class="field"><span>Lokasi tambak</span><input data-dev="location" maxlength="32" value="${esc(dev.location)}"></label>
          <label class="field"><span>Kapasitas hopper (kg)</span><input data-dev="capacityKg" type="number" min="0.5" step="0.1" value="${dev.capacityKg}"></label>
          <label class="field"><span>ID perangkat</span><input value="ESP32-FEED-01" disabled></label>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><span class="ch-label">PROFIL BUDIDAYA</span><h3>Ikan & Kolam</h3></div><div class="chip-icon green"><span class="material-symbols-rounded">set_meal</span></div></div>
        <div class="form-grid">
          <label class="field"><span>Spesies</span>${sel("species", speciesOpts(), p.species, "pref")}</label>
          <label class="field"><span>Fase</span>${sel("stage", ["Grow-out", "Nursery", "Broodstock"], p.stage, "pref")}</label>
          <label class="field"><span>Sistem</span>${sel("system", ["Freshwater pond", "Tank", "Floating cage", "Biofloc"], p.system, "pref")}</label>
          <label class="field"><span>Jenis pakan</span>${sel("feedType", ["Pellet", "Floating pellet", "Sinking pellet", "Crumble"], p.feedType, "pref")}</label>
          <label class="field"><span>Populasi (ekor)</span><input data-pref="population" type="number" min="1" value="${p.population}"></label>
          <label class="field"><span>Berat rata-rata (g)</span><input data-pref="avgWeight" type="number" min="1" value="${p.avgWeight}"></label>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><span class="ch-label">BATAS PAKAN</span><h3>Batas & Target</h3></div><div class="chip-icon amber"><span class="material-symbols-rounded">flag</span></div></div>
        <div class="form-grid">
          <label class="field"><span>Porsi maksimal (g)</span><input data-dev="maxPortion" type="number" min="10" step="10" value="${dev.maxPortion}"></label>
          <label class="field"><span>Target harian (g)</span><input data-dev="dailyTarget" type="number" min="50" step="10" value="${dev.dailyTarget}"></label>
          <label class="field"><span>Ambang stok menipis (%)</span><input data-dev="lowThreshold" type="number" min="5" max="90" value="${dev.lowThreshold}"></label>
        </div>
      </div>
    </div>
    <div class="stack">
      <div class="card">
        <div class="card-head"><div><span class="ch-label">TAMPILAN & NOTIFIKASI</span><h3>Preferensi</h3></div></div>
        <div class="set-row"><div class="sr-tx"><strong>Tema</strong><small>Gelap, terang, atau ikuti perangkat.</small></div><div class="field">${sel("theme", [["dark", "Gelap"], ["light", "Terang"], ["system", "Ikuti perangkat"]], st.theme, "set")}</div></div>
        <div class="set-row"><div class="sr-tx"><strong>Peringatan stok menipis</strong><small>Notifikasi saat stok di bawah ambang.</small></div><label class="switch"><input type="checkbox" data-set="notifLow" ${st.notifLow ? "checked" : ""}><i></i></label></div>
        <div class="set-row"><div class="sr-tx"><strong>Peringatan target harian</strong><small>Notifikasi saat pakan melewati target.</small></div><label class="switch"><input type="checkbox" data-set="notifOver" ${st.notifOver ? "checked" : ""}><i></i></label></div>
        <div class="set-row"><div class="sr-tx"><strong>Peringatan offline</strong><small>Notifikasi saat perangkat terputus.</small></div><label class="switch"><input type="checkbox" data-set="notifOffline" ${st.notifOffline ? "checked" : ""}><i></i></label></div>
      </div>
      <div class="card">
        <div class="card-head"><div><span class="ch-label">MQTT & REALTIME</span><h3>Koneksi Broker</h3></div><span class="pill ${mqttPill()}"><span class="dot"></span>${mqttStateLabel()}</span></div>
        <div class="set-row"><div class="sr-tx"><strong>Mode realtime (MQTT)</strong><small>Aktifkan untuk memakai data dari broker. Matikan untuk simulasi lokal.</small></div><label class="switch"><input type="checkbox" data-mqtt="mode" ${S.mqtt.mode ? "checked" : ""}><i></i></label></div>
        <div class="form-grid" style="margin-top:14px">
          <label class="field"><span>Broker (WSS)</span><input data-mqtt="broker" value="${esc(S.mqtt.broker)}" placeholder="wss://broker.emqx.io:8084/mqtt" spellcheck="false"></label>
          <label class="field"><span>ID perangkat</span><input data-mqtt="deviceId" maxlength="24" value="${esc(S.mqtt.deviceId)}" spellcheck="false"></label>
          <label class="field"><span>Username</span><input data-mqtt="user" value="${esc(S.mqtt.user)}" autocomplete="off" spellcheck="false"></label>
          <label class="field"><span>Password</span><input type="password" data-mqtt="pass" value="${esc(S.mqtt.pass)}" autocomplete="off" spellcheck="false"></label>
        </div>
        <p class="muted" style="font-size:12px;line-height:1.6;margin-top:14px">Topik: <b>feeder/{id}/status</b> · <b>/event</b> · <b>/cmd</b> · <b>/cmd/reply</b> · <b>/schedule</b>. Buka <b>simulator.html</b> di tab lain untuk mensimulasikan ESP32.</p>
      </div>
      ${S.mqtt.mode ? "" : `<div class="card"><div class="card-head"><div><span class="ch-label">SIMULASI</span><h3>Mode Offline Lokal</h3></div></div><div class="set-row"><div class="sr-tx"><strong>Simulasi offline</strong><small>Matikan koneksi ESP32 untuk melihat mode offline.</small></div><label class="switch"><input type="checkbox" data-set="offlineSim" ${st.offlineSim ? "checked" : ""}><i></i></label></div></div>`}
      <div class="card">
        <div class="card-head"><div><span class="ch-label">AKUN</span><h3>Profil Pengguna</h3></div></div>
        <div class="form-grid" style="grid-template-columns:1fr">
          <label class="field"><span>Nama</span><input data-set="userName" maxlength="20" value="${esc(st.userName)}"></label>
          <label class="field"><span>Nama tambak</span><input data-set="farmName" maxlength="24" value="${esc(st.farmName)}"></label>
        </div>
        <div class="actions-row" style="margin-top:14px"><button class="btn" data-act="logout"><span class="material-symbols-rounded">logout</span>Keluar</button></div>
      </div>
      <div class="card">
        <div class="card-head"><div><span class="ch-label">DATA</span><h3>Aplikasi</h3></div></div>
        <p class="muted" style="font-size:12.5px">Semua data tersimpan di browser ini (localStorage). Menghapusnya mengembalikan aplikasi ke kondisi awal.</p>
        <div class="actions-row" style="margin-top:14px"><button class="btn danger" data-act="reset"><span class="material-symbols-rounded">delete_forever</span>Reset semua data</button></div>
      </div>
    </div>
  </div>`;
}

/* ---------- MQTT (realtime via broker) ---------- */
let mqttClient = null;
let mqttDeviceOnline = false;
let mqttConn = "off";
const mqttTopic = (s) => `feeder/${S.mqtt.deviceId || "demo-01"}/${s}`;
const mqttEnabled = () => !!S.mqtt.mode && typeof window.mqtt !== "undefined";
const mqttConnected = () => !!(mqttClient && mqttClient.connected);

function mqttConnect() {
  mqttDisconnect();
  if (!mqttEnabled()) return;
  mqttConn = "connecting";
  const opts = { clientId: "fishfeed-web-" + Math.random().toString(16).slice(2, 8), keepalive: 30, clean: true, reconnectPeriod: 3000 };
  if (S.mqtt.user) opts.username = S.mqtt.user;
  if (S.mqtt.pass) opts.password = S.mqtt.pass;
  try {
    mqttClient = window.mqtt.connect(S.mqtt.broker, opts);
  } catch (e) {
    mqttConn = "error"; notify("error", "MQTT gagal", "Periksa URL broker.", "pengaturan"); return;
  }
  mqttClient.on("connect", () => {
    mqttConn = "connected";
    mqttClient.subscribe([mqttTopic("status"), mqttTopic("event"), mqttTopic("cmd/reply"), mqttTopic("schedule")]);
    toast("Terhubung ke broker MQTT", "ok");
    applyOfflineState();
  });
  mqttClient.on("reconnect", () => { mqttConn = "connecting"; });
  mqttClient.on("message", (topic, payload) => onMqttMessage(topic, payload));
  mqttClient.on("error", (e) => { mqttConn = "error"; toast("Kesalahan MQTT", "error", String((e && e.message) || e)); });
  mqttClient.on("close", () => { mqttConn = "off"; mqttDeviceOnline = false; applyOfflineState(); });
  mqttClient.on("end", () => { mqttConn = "off"; });
}
function mqttDisconnect() {
  if (mqttClient) { try { mqttClient.end(true); } catch (e) {} mqttClient = null; }
  mqttConn = "off"; mqttDeviceOnline = false;
}

function onMqttMessage(topic, payload) {
  let msg = null;
  try { msg = JSON.parse(payload.toString()); } catch (e) { return; }
  if (topic === mqttTopic("status")) applyMqttStatus(msg);
  else if (topic === mqttTopic("event")) applyMqttEvent(msg);
  else if (topic === mqttTopic("cmd/reply")) applyMqttReply(msg);
  else if (topic === mqttTopic("schedule")) applyMqttSchedule(msg);
}
function applyMqttStatus(msg) {
  const wasOnline = mqttDeviceOnline;
  mqttDeviceOnline = msg.online !== false;
  if (typeof msg.weight_kg === "number") S.stockKg = Math.max(0, +msg.weight_kg.toFixed(3));
  if (typeof msg.rssi === "number") S.rssi = msg.rssi;
  if (msg.ts) S.lastSync = new Date(msg.ts).getTime();
  save();
  if (mqttDeviceOnline !== wasOnline) { applyOfflineState(); renderRightPanel(); }
  renderDeviceCard(); renderBanners(); updateLastSync();
  if (cur === "overview") renderStock();
}
function applyMqttEvent(msg) {
  if (msg.id && S.history.some(h => h.ref === msg.id)) return;
  const target = +msg.target || 0, actual = +msg.actual || 0;
  const row = { id: ++S.aid, ref: msg.id, t: (msg.ts ? new Date(msg.ts).getTime() : Date.now()), mode: msg.mode === "auto" ? "auto" : "manual", target, actual, status: (msg.status === "gagal" || msg.status === "failed") ? "gagal" : "ok", duration: msg.duration || 0, note: msg.message || "", samples: msg.samples || genSamples(target, actual) };
  S.history.unshift(row); S.history = S.history.slice(0, 300);
  if (typeof msg.stock_after === "number") S.stockKg = Math.max(0, +msg.stock_after.toFixed(3));
  checkLowStock(); save();
  if (pendingFeed && msg.id === pendingFeed.cmdId) { pendingFeed.resolve(row); pendingFeed = null; }
  renderAll();
  notify("ok", "Pemberian selesai", `${row.mode === "auto" ? "Otomatis" : "Manual"}: ${actual.toFixed(1)} g diberikan.`, "histori");
}
function applyMqttReply(msg) {
  if (pendingFeed && msg.id === pendingFeed.cmdId) pendingFeed.reply(msg);
}
function applyMqttSchedule(list) {
  if (!Array.isArray(list)) return;
  S.schedule = list.map((s, i) => ({ id: s.id || (i + 1), name: s.name || `Sesi ${s.time}`, time: s.time, gram: +s.gram || 100, days: s.days || [0, 1, 2, 3, 4, 5, 6], on: s.on !== false }));
  markPassed(); save(); renderAll();
}
let cmdSeq = 0;
function publishCmd(cmd) {
  if (!mqttConnected()) { toast("Tidak terhubung ke broker", "error"); return null; }
  const id = "ff-" + Date.now() + "-" + (++cmdSeq);
  mqttClient.publish(mqttTopic("cmd"), JSON.stringify({ id, ...cmd }), { qos: 1 });
  return id;
}
function mqttSyncSchedule() {
  if (!mqttEnabled() || !mqttConnected()) return;
  publishCmd({ cmd: "schedule_set", schedule: S.schedule.map(s => ({ id: s.id, name: s.name, time: s.time, gram: s.gram, days: s.days, on: s.on })) });
}
function mqttStateLabel() {
  if (!S.mqtt.mode) return "Simulasi";
  if (typeof window.mqtt === "undefined") return "CDN tidak dimuat";
  if (mqttConn === "connected") return "Terhubung";
  if (mqttConn === "connecting") return "Menghubungkan…";
  if (mqttConn === "error") return "Error";
  return "Terputus";
}
function mqttPill() {
  if (!S.mqtt.mode || mqttConn === "connected") return "ok";
  if (mqttConn === "connecting") return "warn";
  return "bad";
}

/* ---------- Router ---------- */
const VIEWS = { overview: 1, jadwal: 1, histori: 1, cli: 1, pengaturan: 1 };
const PAGES = { overview: renderOverview, jadwal: pageJadwal, histori: pageHistori, cli: pageCli, pengaturan: pagePengaturan };
let cur = "overview";
function head(crumb, title, desc) {
  return `<div class="page-intro"><div><h2>${title}</h2><p>${desc}</p></div><div class="last-sync" id="lastSync"><span class="material-symbols-rounded">sync</span><span><strong>--</strong> <span class="ls-rel">· --</span></span></div></div>`;
}
function route() {
  const v = (location.hash || "#overview").slice(1);
  cur = VIEWS[v] ? v : "overview";
  $$(".view").forEach(x => x.classList.toggle("active", x.id === "view-" + cur));
  $$(".nav a").forEach(a => a.classList.toggle("active", a.dataset.view === cur));
  const META = { overview: ["Overview", "MONITORING & KONTROL"], jadwal: ["Jadwal Pakan", "MANAJEMEN PAKAN"], histori: ["Histori", "CATATAN PEMBERIAN"], cli: ["Web-CLI", "KONSOL PERANGKAT"], pengaturan: ["Pengaturan", "SISTEM & PROFIL"] };
  $("#pageTitle").textContent = META[cur][0];
  $("#crumb").textContent = META[cur][1];
  closeSidebar();
  PAGES[cur]();
  updateLastSync();
  window.scrollTo({ top: 0 });
}
function go(v) { if (location.hash === "#" + v) route(); else location.hash = v; }
window.addEventListener("hashchange", route);

/* ---------- Sidebar mobile ---------- */
function closeSidebar() { $("#sidebar").classList.remove("open"); $("#scrim").hidden = true; }
function openSidebar() { $("#sidebar").classList.add("open"); $("#scrim").hidden = false; }
$("#menuBtn").addEventListener("click", e => { e.stopPropagation(); openSidebar(); });
$("#scrim").addEventListener("click", closeSidebar);

/* ---------- Dropdown ---------- */
document.addEventListener("click", e => {
  const dd = e.target.closest(".dropdown");
  if (dd && !e.target.closest(".menu")) {
    $$(".dropdown.open").forEach(d => { if (d !== dd) d.classList.remove("open"); });
    dd.classList.toggle("open");
  } else if (!dd) {
    $$(".dropdown.open").forEach(d => d.classList.remove("open"));
  }
});

/* ---------- Command palette ---------- */
function getPaletteActions() {
  return [
    { group: "Navigasi", items: [
      { icon: "dashboard", label: "Overview", hint: "#overview", run: () => go("overview") },
      { icon: "calendar_clock", label: "Jadwal Pakan", hint: "#jadwal", run: () => go("jadwal") },
      { icon: "monitoring", label: "Histori", hint: "#histori", run: () => go("histori") },
      { icon: "terminal", label: "Web-CLI", hint: "#cli", run: () => go("cli") },
      { icon: "settings", label: "Pengaturan", hint: "#pengaturan", run: () => go("pengaturan") },
    ] },
    { group: "Aksi", items: [
      { icon: "restaurant", label: "Beri pakan sekarang", hint: "Manual", run: () => startManualFeed() },
      { icon: "add", label: "Tambah jadwal", hint: "Dialog", run: () => schModal() },
      { icon: "download", label: "Ekspor CSV histori", hint: "File", run: () => exportCSV() },
      { icon: "sync", label: isOnline() ? "Simulasi offline" : "Kembalikan online", hint: "Toggle", run: () => { S.settings.offlineSim = !isOnline(); save(); applyOfflineState(); renderAll(); } },
    ] },
    { group: "Web-CLI", items: [
      { icon: "terminal", label: "status", hint: "Ringkasan", run: () => { go("cli"); setTimeout(() => runCmd("status"), 80); } },
      { icon: "terminal", label: "help", hint: "Daftar perintah", run: () => { go("cli"); setTimeout(() => runCmd("help"), 80); } },
    ] },
  ];
}
const palette = $("#paletteBackdrop"), paletteInput = $("#paletteInput"), paletteList = $("#paletteList");
let palSel = 0, palItems = [];
function openPalette() { palette.hidden = false; paletteInput.value = ""; palSel = 0; renderPalette(""); setTimeout(() => paletteInput.focus(), 30); }
function closePalette() { palette.hidden = true; }
function renderPalette(q) {
  q = q.toLowerCase().trim();
  const groups = getPaletteActions().map(g => ({ group: g.group, items: g.items.filter(it => it.label.toLowerCase().includes(q)) })).filter(g => g.items.length);
  palItems = groups.flatMap(g => g.items);
  paletteList.innerHTML = groups.map(g => `<div class="palette-group">${g.group}</div>${g.items.map(it => { const gi = palItems.indexOf(it); return `<button class="palette-item ${gi === palSel ? "sel" : ""}" data-pi="${gi}"><span class="material-symbols-rounded">${it.icon}</span>${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ""}</button>`; }).join("")}`).join("") || `<div class="palette-empty">Tidak ada hasil untuk "${esc(q)}".</div>`;
}
function updatePaletteSel() { $$(".palette-item", paletteList).forEach((b, i) => { b.classList.toggle("sel", i === palSel); if (i === palSel) b.scrollIntoView({ block: "nearest" }); }); }
paletteInput.addEventListener("input", () => { palSel = 0; renderPalette(paletteInput.value); });
paletteList.addEventListener("click", e => { const b = e.target.closest("[data-pi]"); if (!b) return; const it = palItems[+b.dataset.pi]; if (it) { closePalette(); it.run(); } });
palette.addEventListener("mousedown", e => { if (e.target === palette) closePalette(); });
$("#cmdTrigger").addEventListener("click", e => { e.stopPropagation(); openPalette(); });

/* ---------- Aksi (event delegation) ---------- */
const ACT = {
  go: el => go(el.dataset.v),
  feed: () => startManualFeed(),
  "add-sch": () => schModal(),
  "edit-sch": el => schModal(findSch(el.dataset.id)),
  "del-sch": async el => { const s = findSch(el.dataset.id); if (!s) return; if (await confirm({ icon: "delete", tone: "danger", title: "Hapus jadwal", okText: "Hapus", body: `Hapus jadwal <b>${esc(s.name)}</b> (${s.time})?` })) { S.schedule = S.schedule.filter(x => x !== s); save(); renderAll(); mqttSyncSchedule(); toast("Jadwal dihapus", "ok"); } },
  "stock-modal": () => stockModal(),
  "target-save": () => { const v = Math.round(Number($("#tgtInput").value)); if (!(v >= 50 && v <= 5000)) return ($("#tgtErr").textContent = "Target harus 50–5000 g."); S.device.dailyTarget = v; save(); renderAll(); toast("Target harian disimpan", "ok"); },
  "target-suggest": () => { S.device.dailyTarget = Math.max(50, totalPlanned()); save(); renderAll(); toast("Target disamakan dengan jadwal", "ok"); },
  hf: el => { hf[el.dataset.k] = el.dataset.v; pageHistori(); },
  export: () => exportCSV(),
  "clear-hist": async () => { if (await confirm({ icon: "delete_sweep", tone: "danger", title: "Hapus histori", okText: "Hapus", body: "Seluruh riwayat pemberian pakan akan dihapus dan tidak bisa dikembalikan." })) { S.history = []; save(); renderAll(); toast("Histori dihapus", "ok"); } },
  "open-notif": el => { const n = S.alerts.find(x => x.id === +el.dataset.id); if (n) { n.read = true; save(); renderNotifs(); if (n.link) go(n.link); } },
  "read-all": () => { S.alerts.forEach(n => n.read = true); save(); renderNotifs(); },
  profile: () => openModal({ icon: "account_circle", title: "Profil saya", body: `<label class="field"><span>Nama</span><input id="fUser" maxlength="20" value="${esc(S.settings.userName)}"></label><label class="field" style="margin-top:12px"><span>Nama tambak</span><input id="fFarm" maxlength="24" value="${esc(S.settings.farmName)}"></label>`, actions: [{ label: "Batal" }, { label: "Simpan", cls: "primary", onClick: (box) => { S.settings.userName = box.querySelector("#fUser").value.trim() || "Peternak"; S.settings.farmName = box.querySelector("#fFarm").value.trim() || "Fish Farm"; save(); renderHeader(); toast("Profil diperbarui", "ok"); } }] }),
  help: () => openModal({ icon: "help", title: "Bantuan", body: `<ul><li><b>Overview</b> — pantau stok, jadwal berikutnya, dan beri pakan manual.</li><li><b>Jadwal Pakan</b> — atur sesi otomatis, stok, dan target harian.</li><li><b>Histori</b> — catatan pemberian beserta grafik akurasi.</li><li><b>Web-CLI</b> — operasikan feeder lewat perintah teks (ketik <b>help</b>).</li><li><b>Pengaturan</b> — profil, batas pakan, notifikasi, dan tema.</li><li>Tekan <b>Ctrl+K</b> untuk command palette, <b>Esc</b> untuk menutup pop up.</li></ul>`, actions: [{ label: "Mengerti", cls: "primary" }] }),
  logout: async () => { if (await confirm({ icon: "logout", title: "Keluar", okText: "Keluar", body: "Anda yakin ingin keluar dari dashboard?" })) { try { localStorage.removeItem(AUTH_KEY); } catch (e) {} location.reload(); } },
  reset: async () => { if (await confirm({ icon: "warning", tone: "danger", title: "Reset semua data", okText: "Reset", body: "Jadwal, histori, preferensi, dan pengaturan akan dikembalikan ke awal." })) { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); } },
  "art-sum": el => { const a = ARTICLES.find(x => x.id === el.dataset.id); if (!a) return; openModal({ icon: "article", title: a.topic, body: `<p><b>${esc(a.title)}</b></p><p style="margin-top:8px">${esc(a.sum)}</p><p class="muted" style="margin-top:10px">${a.src} · ${a.year}</p>`, actions: [{ label: "Tutup" }, { label: "Buka artikel", cls: "primary", onClick: () => { window.open(a.url, "_blank", "noopener,noreferrer"); } }] }); },
  "open-detail": el => openDetail(el.dataset.id),
};
function exportCSV() {
  const rows = ["waktu,mode,target_g,aktual_g,status", ...S.history.map(h => { const d = new Date(h.t); return `${dayKey(d)} ${fmtTime(d)},${h.mode},${h.target},${h.actual},${h.status}`; })];
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" })); a.download = "histori-pakan.csv"; a.click(); URL.revokeObjectURL(a.href);
}
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  $$(".dropdown.open").forEach(d => d.classList.remove("open"));
  const fn = ACT[el.dataset.act];
  if (fn) fn(el);
});
document.addEventListener("click", e => { const c = e.target.closest("[data-day]"); if (c) c.classList.toggle("on"); });

/* ---------- Perubahan input (change) ---------- */
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.act === "toggle-sch") { const s = findSch(t.dataset.id); if (s) { s.on = t.checked; markPassed(); save(); renderAll(); mqttSyncSchedule(); } return; }
  if (t.dataset.pref) {
    let v = t.value; if (t.type === "number") { v = Number(v); if (!(v > 0)) { t.value = S.pond[t.dataset.pref]; return; } }
    S.pond[t.dataset.pref] = v; save(); renderRightPanel(); return;
  }
  if (t.dataset.dev) {
    let v = t.value; if (t.type === "number") { v = Number(v); if (!(v > 0)) { t.value = S.device[t.dataset.dev]; return; } }
    S.device[t.dataset.dev] = v; save(); renderDeviceCard(); renderBanners(); if (t.dataset.dev === "capacityKg" || t.dataset.dev === "lowThreshold") checkLowStock(); return;
  }
  if (t.dataset.mqtt) {
    const k = t.dataset.mqtt;
    if (t.type === "checkbox") {
      if (k === "mode" && t.checked && typeof window.mqtt === "undefined") { t.checked = false; S.mqtt.mode = false; save(); toast("MQTT.js tidak dimuat", "error", "Perlu koneksi internet untuk memuat CDN MQTT.js."); renderAll(); return; }
      S.mqtt[k] = t.checked; save();
      if (k === "mode") { t.checked ? mqttConnect() : mqttDisconnect(); applyOfflineState(); renderAll(); }
      return;
    }
    let v = t.value; S.mqtt[k] = v; save();
    if ((k === "broker" || k === "deviceId") && S.mqtt.mode) mqttConnect();
    if (cur === "pengaturan") pagePengaturan();
    return;
  }
  if (t.dataset.set) {
    const k = t.dataset.set;
    if (t.type === "checkbox") {
      S.settings[k] = t.checked; save();
      if (k === "offlineSim") { applyOfflineState(); renderAll(); notify(t.checked ? "warn" : "ok", t.checked ? "Perangkat offline" : "Perangkat online", t.checked ? "ESP32 terputus (simulasi)." : "ESP32 terhubung kembali.", "pengaturan"); }
      return;
    }
    let v = t.value; if (k === "userName") v = v || "Peternak"; if (k === "farmName") v = v || "Fish Farm";
    S.settings[k] = v; save();
    if (k === "theme") applyTheme(); else renderHeader();
    return;
  }
});

/* ---------- Keyboard global ---------- */
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if (e.key === "Escape") {
    if (!palette.hidden) { closePalette(); return; }
    $$(".dropdown.open").forEach(d => d.classList.remove("open"));
    if (closeTopSheet()) return;
    if (closeTopModal()) return;
    closeSidebar();
    return;
  }
  if (!palette.hidden) {
    if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); updatePaletteSel(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(0, palSel - 1); updatePaletteSel(); }
    else if (e.key === "Enter") { e.preventDefault(); const it = palItems[palSel]; if (it) { closePalette(); it.run(); } }
  }
});

/* ---------- Tick & auto-feed ---------- */
const activeSchedule = () => S.schedule.filter(s => s.on).sort((a, b) => a.time.localeCompare(b.time));
const activeScheduleCount = () => activeSchedule().length;
function autoFeed(now) {
  if (mqttEnabled()) return; // di mode MQTT, jadwal dieksekusi oleh perangkat (firmware)
  let changed = false;
  const dk = dayKey(now), ti = dowIdx(now);
  S.schedule.forEach(s => {
    if (!s.on || !s.days.includes(ti)) return;
    const k = `${dk}#${s.id}`;
    if (S.fired.includes(k) || at(s.time) > now) return;
    S.fired.push(k); changed = true;
    if (S.stockKg * 1000 < s.gram) {
      notify("error", "Jadwal dilewati", `${s.name} (${s.time}) gagal — stok tidak cukup.`, "jadwal");
      toast("Jadwal dilewati", "warn", `${s.name} gagal: stok tidak cukup.`);
    } else {
      const a = recordFeed(s.gram, "auto");
      notify("ok", "Pemberian otomatis selesai", `${s.name}: ${s.gram} g diberikan pukul ${s.time}.`, "histori");
      toast("Pemberian otomatis selesai", "ok", `${s.name} · ${a.toFixed(1)} g`);
    }
  });
  S.fired = S.fired.slice(-120);
  if (changed) { save(); renderAll(); }
}
function updateLastSync() {
  const ls = $("#lastSync"); if (!ls) return;
  if (isOnline()) S.lastSync = Date.now();
  const d = new Date(S.lastSync);
  ls.querySelector("strong").textContent = `${fmtDate(d)} ${fmtClock(d)}`;
  ls.querySelector(".ls-rel").textContent = isOnline() ? "· baru saja" : "· " + ago(S.lastSync);
}
function tick() {
  const now = new Date();
  autoFeed(now);
  updateLastSync();
  if (cur === "overview") renderNextFeeding();
  if (now.getSeconds() === 0) renderNotifs();
}

/* ---------- Render semua ---------- */
function renderAll() {
  renderDeviceCard(); renderHeader(); renderNotifs(); renderBanners(); renderRightPanel();
  if (PAGES[cur]) PAGES[cur]();
}

/* ---------- Login (gate client-side) ---------- */
// ============================================================
//  GANTI USERNAME & PASSWORD DI SINI — hanya diketahui kelompok PBL SIBI.
//  CATATAN: ini BUKAN keamanan beneran. Kredensial bisa dibaca lewat
//  View Source / DevTools (F12) dan mudah di-bypass. Fungsinya hanya
//  menghalau orang iseng yang dapat URL-nya.
// ============================================================
const AUTH_USER = "kelompok4paralel2";
const AUTH_PASS = "fishfeedsibi";
const AUTH_KEY = "fishfeed-auth";

const isAuthed = () => { try { return localStorage.getItem(AUTH_KEY) === "1"; } catch (e) { return false; } };
function showLogin() { $("#login").classList.add("show"); }
function hideLogin() { $("#login").classList.remove("show"); }

/* ---------- Init ---------- */
function initApp() {
  if (!S.seeded) { seed(); notify("info", "Sistem terhubung", "ESP32 online dan siap menerima perintah.", "overview"); notify("ok", "Sinkronisasi berhasil", "Data perangkat diperbarui.", "histori"); }
  markPassed(); checkLowStock(); save();
  applyTheme(); mqttConnect();
  _prevOnline = isOnline();
  applyOfflineState();
  renderHeader(); renderDeviceCard(); renderNotifs(); renderBanners(); renderRightPanel();
  route();
  tick();
  setInterval(tick, 1000);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
}

/* Gerbang: tampilkan login dulu jika belum masuk */
if (isAuthed()) {
  initApp();
} else {
  showLogin();
}

/* Submit form login */
$("#loginForm").addEventListener("submit", e => {
  e.preventDefault();
  const u = $("#loginUser").value.trim();
  const p = $("#loginPass").value;
  if (u === AUTH_USER && p === AUTH_PASS) {
    try { localStorage.setItem(AUTH_KEY, "1"); } catch (e) {}
    hideLogin();
    $("#loginErr").hidden = true;
    $("#loginForm").reset();
    initApp();
  } else {
    $("#loginErr").hidden = false;
    $("#loginPass").value = "";
    $("#loginPass").focus();
  }
});
