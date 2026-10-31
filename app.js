/* =========================================================
   Fish Feeder Dashboard - app.js  (menggantikan script.js)
   ========================================================= */

const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2, "0");
const rnd = (a, b) => Math.random() * (b - a) + a;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d) => `${pad(d.getDate())} ${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}`;
const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (time, daysAgo = 0, base = new Date()) => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date(base);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d;
};
const ago = (t) => {
    const s = (Date.now() - t) / 1000;
    return s < 60 ? "baru saja" : s < 3600 ? `${Math.floor(s / 60)} mnt lalu` : s < 86400 ? `${Math.floor(s / 3600)} jam lalu` : `${Math.floor(s / 86400)} hari lalu`;
};

/* =========================================================
   DATA & PENYIMPANAN (localStorage)
   ========================================================= */
const SPECIES = {
    tilapia: { name: "Tilapia (Nila)", short: "Tilapia", rec: [4, 6] },
    catfish: { name: "Catfish (Lele)", short: "Catfish", rec: [2, 3] },
    carp: { name: "Common Carp (Mas)", short: "Carp", rec: [6, 6] },
};

// Rentang frekuensi berasal dari abstrak tinjauan Scientific African (2021).
// Tautan sudah muncul di hasil pencarian; judul Aquahoy diambil dari slug URL-nya.
const ARTICLES = [
    { id: "freq", tag: "FREKUENSI PAKAN", topic: "Frekuensi pakan", title: "Feeding frequency and stocking density: tilapia, catfish and carp", src: "Scientific African", year: "Jul 2021",
      url: "https://doaj.org/article/78ed2b8e99cd4af2a1d5a0395bd27022",
      sum: "Tinjauan lebih dari 70 studi tentang pengaruh frekuensi pemberian pakan pada tilapia, lele, dan mas. Rentang optimal yang dilaporkan: 4–6×/hari untuk tilapia, 6× untuk mas, dan 2–3× untuk lele." },
    { id: "ctrl", tag: "KUALITAS AIR", topic: "Kualitas air & kontrol pakan", title: "Feeding control and water quality monitoring in aquaculture systems", src: "arXiv", year: "2023",
      url: "https://arxiv.org/pdf/2306.09920",
      sum: "Membahas frekuensi, waktu, dan laju pemberian pakan, serta hubungannya dengan kualitas air dan pertumbuhan ikan, termasuk peluang otomasi." },
    { id: "meta", tag: "STRATEGI", topic: "Strategi pemberian pakan", title: "Optimization of feeding strategies in aquaculture: a meta-analysis", src: "Aquahoy", year: "2025",
      url: "https://aquahoy.com/optimization-feeding-strategies-aquaculture-meta-analysis/",
      sum: "Ringkasan meta-analisis: frekuensi pakan memengaruhi pertumbuhan, tetapi titik optimalnya bergantung pada spesies, kondisi budidaya, dan laju pemberian." },
];

const DEFAULTS = {
    stockKg: 1.28, capacityKg: 2, targetGram: 480,
    schedule: [
        { id: 1, name: "Morning Feeding", time: "07:00", gram: 120, on: true },
        { id: 2, name: "Noon Feeding", time: "12:00", gram: 120, on: true },
        { id: 3, name: "Afternoon Feeding", time: "17:00", gram: 120, on: true },
        { id: 4, name: "Evening Feeding", time: "21:00", gram: 120, on: true },
    ],
    history: [], fired: [], notifs: [], nid: 0, seeded: false, lowWarned: false,
    prefs: { species: "tilapia", stage: "Grow-out", system: "Freshwater pond", population: 1200, avgWeight: 85, goal: "Growth", feedType: "Pellet", topic: "freq" },
    settings: { theme: "system", notifLow: true, notifOver: true, userName: "Saya", farmName: "Fish Farm" },
};

let S = load();
function load() {
    try {
        const r = JSON.parse(localStorage.getItem("fishfeed"));
        if (r) return { ...structuredClone(DEFAULTS), ...r, prefs: { ...DEFAULTS.prefs, ...r.prefs }, settings: { ...DEFAULTS.settings, ...r.settings } };
    } catch (e) {}
    return structuredClone(DEFAULTS);
}
const save = () => { try { localStorage.setItem("fishfeed", JSON.stringify(S)); } catch (e) {} };

/* Data contoh pertama kali: riwayat mengikuti jam perangkat */
function seed() {
    const now = new Date(), rows = [];
    const add = (t, g, mode) => rows.push({ t: t.getTime() + Math.round(rnd(0, 3000)), target: g, actual: Math.round((g + rnd(-1.5, 1.5)) * 10) / 10, mode });
    [1, 0].forEach((off) => S.schedule.forEach((s) => { const t = at(s.time, off); if (t <= now) add(t, s.gram, "auto"); }));
    add(at("14:36", 1), 80, "manual");
    S.history = rows.sort((a, b) => b.t - a.t);
    S.seeded = true;
    notify("info", "Sistem terhubung", "ESP32 online dan siap menerima perintah.", "overview");
    notify("ok", "Sinkronisasi berhasil", "Data perangkat sudah diperbarui.", "histori");
}

/* Jadwal yang waktunya sudah lewat ditandai agar tidak langsung dieksekusi */
function markPassed() {
    const now = new Date();
    S.schedule.forEach((s) => { const k = `${dayKey(now)}#${s.id}`; if (at(s.time) <= now && !S.fired.includes(k)) S.fired.push(k); });
    S.fired = S.fired.slice(-80);
}

const todayRows = () => { const k = dayKey(new Date()); return S.history.filter((h) => dayKey(new Date(h.t)) === k); };
const todayGram = () => Math.round(todayRows().reduce((a, h) => a + h.actual, 0));
const activeSchedule = () => S.schedule.filter((s) => s.on).sort((a, b) => a.time.localeCompare(b.time));
const totalPlanned = () => S.schedule.filter((s) => s.on).reduce((a, s) => a + s.gram, 0);

/* =========================================================
   NOTIFIKASI & TOAST
   ========================================================= */
function notify(type, title, text, link) {
    S.notifs.unshift({ id: ++S.nid, type, title, text, link, t: Date.now(), read: false });
    S.notifs = S.notifs.slice(0, 12);
    save();
    if (typeof renderNotifs === "function") renderNotifs();
}

const toast = document.createElement("div");
toast.className = "toast";
document.body.append(toast);
let toastTimer;
function showToast(msg, type = "warn") {
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 5000);
}

/* =========================================================
   POP UP (MODAL)
   ========================================================= */
const MODALS = [];
function openModal(o) {
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
        <button class="modal-x" aria-label="Tutup"><span class="material-symbols-outlined">close</span></button>
        <div class="modal-head"><span class="modal-icon material-symbols-outlined"></span><h3></h3></div>
        <div class="modal-body"></div><div class="modal-actions"></div></div>`;
    const box = $(".modal", back);
    let done = false, resolve;
    const closed = new Promise((r) => (resolve = r));
    const api = { box, closed, close, update, dismissable: () => o.dismissable !== false };

    function close(v) {
        if (done) return;
        done = true;
        back.classList.remove("show");
        MODALS.splice(MODALS.indexOf(api), 1);
        setTimeout(() => { back.remove(); resolve(v); }, 220);
    }
    function update(n) {
        o = { ...o, ...n };
        $(".modal-icon", box).textContent = o.icon || "info";
        $("h3", box).textContent = o.title || "";
        box.dataset.tone = o.tone || "";
        $(".modal-body", box).innerHTML = o.body || "";
        $(".modal-x", box).hidden = o.dismissable === false;
        const act = $(".modal-actions", box);
        act.innerHTML = "";
        (o.actions || []).forEach((a) => {
            const b = document.createElement("button");
            b.className = "btn " + (a.cls || "");
            b.textContent = a.label;
            b.onclick = () => { const r = a.onClick && a.onClick(box, api); if (r !== false) close(a.value); };
            act.append(b);
        });
        act.hidden = !(o.actions || []).length;
    }

    $(".modal-x", box).onclick = () => close();
    back.addEventListener("mousedown", (e) => { if (e.target === back && api.dismissable()) close(); });
    update({});
    MODALS.push(api);
    document.body.append(back);
    requestAnimationFrame(() => requestAnimationFrame(() => back.classList.add("show")));
    setTimeout(() => $("input, select", box)?.focus(), 260);
    return api;
}

const confirmModal = (o) => openModal({
    icon: "help", ...o, body: `<p>${o.message}</p>`,
    actions: [{ label: o.cancelText || "Batal", value: false }, { label: o.okText || "Ya", cls: o.tone === "danger" ? "danger" : "primary", value: true }],
}).closed.then((v) => !!v);

document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const m = MODALS[MODALS.length - 1];
    if (m && m.dismissable()) m.close();
    else $(".sidebar").classList.remove("open");
});

/* =========================================================
   TEMA
   ========================================================= */
const themeToggle = $("#themeToggle");
function applyTheme() {
    const m = S.settings.theme;
    const dark = m === "dark" || (m === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.body.classList.toggle("dark-mode", dark);
    $(".material-symbols-outlined", themeToggle).textContent = dark ? "light_mode" : "dark_mode";
}
themeToggle.addEventListener("click", () => {
    S.settings.theme = document.body.classList.contains("dark-mode") ? "light" : "dark";
    save(); applyTheme();
    if (cur === "pengaturan") pageSettings();
});

/* =========================================================
   RENDER: OVERVIEW
   ========================================================= */
const slider = $(".feed-slider");
const warnBox = $(".manual-warning");
const warnText = $("p", warnBox);
const warnIcon = $(".material-symbols-outlined", warnBox);
const warnDefault = warnText.innerHTML;

function updateWarning() {
    const remain = S.targetGram - todayGram();
    const over = Number(slider.value) > remain;
    warnBox.classList.toggle("danger", over);
    warnIcon.textContent = over ? "warning" : "info";
    warnText.innerHTML = over ? `Porsi ini <strong>melewati target harian</strong>. Sisa target hari ini ${Math.max(0, remain)} g.` : warnDefault;
}
slider.addEventListener("input", () => { $(".weight-display strong").textContent = slider.value; updateWarning(); });

function renderStock() {
    const pct = (S.stockKg / S.capacityKg) * 100, low = pct < 20;
    $(".stock-number strong").textContent = S.stockKg.toFixed(2);
    $(".stock-bar-fill").style.width = Math.min(100, pct) + "%";
    $(".stock-bar-fill").style.background = low ? "var(--red)" : "";
    $(".stock-details strong").textContent = S.capacityKg.toFixed(2) + " kg";
    const st = $(".stock-status");
    st.lastChild.textContent = low ? "Feed level rendah, segera isi ulang" : "Feed level normal";
    st.style.color = low ? "var(--red)" : "var(--green)";
}

function renderToday() {
    const g = todayGram(), t = S.targetGram, pct = Math.round((g / t) * 100), now = new Date();
    const act = S.schedule.filter((s) => s.on);
    $(".daily-number strong").textContent = g;
    $(".progress-top strong").textContent = `${g} / ${t} g`;
    $(".progress-fill").style.width = Math.min(100, pct) + "%";
    $(".daily-meta .success").textContent = pct + "%";
    $(".daily-meta span").textContent = `${act.filter((s) => at(s.time) <= now).length} dari ${act.length} sesi`;
    $(".daily-summary").classList.toggle("over", g > t);
    updateWarning();
}

function renderTodaySchedule() {
    const now = new Date();
    const list = [...S.schedule].sort((a, b) => a.time.localeCompare(b.time));
    $("#todaySchedule").innerHTML = list.length ? list.map((s) => {
        const passed = s.on && at(s.time) <= now;
        const cls = !s.on ? "off" : passed ? "completed" : "upcoming";
        const ic = !s.on ? "block" : passed ? "check_circle" : "schedule";
        return `<div class="schedule-item ${cls}"><div class="schedule-time">${s.time}</div><div class="schedule-line"></div>
            <div class="schedule-content"><strong>${esc(s.name)}</strong><span>${s.gram} g · ${s.on ? "Automatic" : "Nonaktif"}</span></div>
            <span class="schedule-status material-symbols-outlined">${ic}</span></div>`;
    }).join("") : `<p class="empty">Belum ada jadwal. Tambahkan di menu Jadwal Pakan.</p>`;
}

const modeBadge = (m) => m === "auto"
    ? `<span class="mode automatic"><span class="material-symbols-outlined">autorenew</span>Automatic</span>`
    : `<span class="mode manual"><span class="material-symbols-outlined">touch_app</span>Manual</span>`;
const histRow = (h) => {
    const d = new Date(h.t);
    return `<tr><td><strong>${fmtTime(d)}</strong><small>${fmtDate(d)}</small></td><td><strong>${h.target} g</strong></td><td>${modeBadge(h.mode)}</td>
        <td>${h.target} g</td><td>${h.actual.toFixed(1)} g</td><td><span class="status success-status"><span></span>Success</span></td></tr>`;
};
const renderRecent = () => { $("#recentBody").innerHTML = S.history.slice(0, 5).map(histRow).join("") || `<tr><td colspan="6" class="empty">Belum ada riwayat.</td></tr>`; };

/* =========================================================
   RENDER: PANEL KANAN (profil & rekomendasi)
   ========================================================= */
function renderProfile() {
    const p = S.prefs, sp = SPECIES[p.species];
    $("#farmTitle").textContent = `${sp.short} ${p.stage}`;
    $("#farmSystem").textContent = p.system;
    $("#profileGrid").innerHTML = [["Populasi", `${Number(p.population).toLocaleString("en-US")} fish`], ["Average Weight", `${p.avgWeight} g`], ["Feeding Goal", p.goal], ["Feed Type", p.feedType]]
        .map(([a, b]) => `<div><span>${a}</span><strong>${esc(b)}</strong></div>`).join("");
}

function renderReco() {
    const p = S.prefs, sp = SPECIES[p.species], n = S.schedule.filter((s) => s.on).length, [lo, hi] = sp.rec;
    const ok = n >= lo && n <= hi;
    const msg = ok ? `Jadwal Anda (${n}×/hari) sudah sesuai.` : n < lo ? `Jadwal Anda ${n}×/hari — pertimbangkan menambah sesi.` : `Jadwal Anda ${n}×/hari — lebih banyak dari rentang tersebut.`;
    const main = ARTICLES.find((a) => a.id === p.topic) || ARTICLES[0];
    $("#recoBox").innerHTML = `
        <div class="tip ${ok ? "" : "warn"}"><span class="material-symbols-outlined">${ok ? "task_alt" : "tips_and_updates"}</span>
            <p><strong>${sp.name}: ${lo === hi ? lo : lo + "–" + hi}×/hari</strong> (Scientific African, 2021). ${msg}</p></div>
        <article class="article-card"><div class="article-image"><div class="article-overlay"><span>${main.tag}</span></div></div>
            <div class="article-content"><h3>${esc(main.title)}</h3><p>${esc(main.sum)}</p>
                <div class="article-meta"><span>${main.year}</span><span>${main.src}</span></div>
                <div class="art-actions"><button class="link-btn" data-act="art-sum" data-id="${main.id}">Ringkasan</button>
                    <a href="${main.url}" target="_blank" rel="noopener noreferrer" class="read-article">Buka artikel<span class="material-symbols-outlined">arrow_outward</span></a></div></div></article>
        <div class="more-articles">${ARTICLES.filter((a) => a !== main).map((a) => `<a href="${a.url}" target="_blank" rel="noopener noreferrer"><span>${esc(a.title)}</span><small>${a.src} · ${a.year}</small></a>`).join("")}</div>`;
}

/* =========================================================
   RENDER: HEADER, DROPDOWN
   ========================================================= */
function renderHeader() {
    $(".profile-info strong").textContent = S.settings.userName;
    $(".profile-info small").textContent = S.settings.farmName;
    $("#ddName").textContent = S.settings.userName;
    $("#ddFarm").textContent = S.settings.farmName;
}

const NT_ICON = { ok: "check_circle", warn: "warning", error: "error", info: "info" };
function renderNotifs() {
    const un = S.notifs.filter((n) => !n.read).length;
    $("#notifDot").hidden = !un;
    $("#notifCount").textContent = un ? `${un} baru` : "Semua sudah dibaca";
    $("#notifList").innerHTML = S.notifs.length ? S.notifs.map((n) => `
        <button class="nt ${n.read ? "" : "unread"}" data-act="open-notif" data-id="${n.id}">
            <span class="nt-ic ${n.type} material-symbols-outlined">${NT_ICON[n.type]}</span>
            <span class="nt-tx"><strong>${esc(n.title)}</strong><small>${esc(n.text)}</small><em>${ago(n.t)}</em></span></button>`).join("") : `<p class="empty">Tidak ada notifikasi.</p>`;
}

document.addEventListener("click", (e) => { $$(".dropdown.open").forEach((d) => { if (!d.contains(e.target)) d.classList.remove("open"); }); });
$$(".dropdown").forEach((d) => {
    d.addEventListener("click", (e) => { if (!e.target.closest(".dd-menu")) d.classList.toggle("open"); });
    d.addEventListener("mouseleave", () => d.classList.remove("suppress"));
});

/* =========================================================
   LOGIKA PEMBERIAN PAKAN
   ========================================================= */
function recordFeed(target, mode) {
    const before = todayGram();
    const actual = Math.round((target + rnd(-1.5, 1.5)) * 10) / 10;
    S.stockKg = Math.max(0, +(S.stockKg - actual / 1000).toFixed(4));
    S.history.unshift({ t: Date.now(), target, actual, mode });
    S.history = S.history.slice(0, 300);
    const after = todayGram();
    if (before <= S.targetGram && after > S.targetGram && S.settings.notifOver)
        notify("warn", "Target harian terlewati", `Total hari ini ${after} g dari target ${S.targetGram} g.`, "histori");
    const low = S.stockKg / S.capacityKg < 0.2;
    if (low && !S.lowWarned && S.settings.notifLow) notify("warn", "Stok pakan menipis", `Sisa ${S.stockKg.toFixed(2)} kg. Segera isi ulang.`, "jadwal");
    S.lowWarned = low;
    save();
    return actual;
}

$(".feed-button").addEventListener("click", async () => {
    const g = Number(slider.value);
    if (g > S.stockKg * 1000) {
        openModal({ title: "Persediaan tidak cukup", icon: "inventory_2", tone: "danger",
            body: `<p>Porsi <b>${g} g</b> melebihi sisa pakan <b>${Math.round(S.stockKg * 1000)} g</b>. Isi ulang box pakan terlebih dahulu.</p>`,
            actions: [{ label: "Tutup" }, { label: "Atur stok", cls: "primary", onClick: () => go("jadwal") }] });
        return;
    }
    const now = todayGram();
    if (now + g > S.targetGram) {
        const ok = await confirmModal({ title: "Melewati target harian", icon: "warning", tone: "warn", okText: "Tetap beri pakan",
            message: `Total hari ini akan menjadi <b>${now + g} g</b>, melewati target <b>${S.targetGram} g</b> (lebih ${now + g - S.targetGram} g). Pemberian berlebih dapat menurunkan kualitas air.` });
        if (!ok) return;
    }
    runFeedingModal(g);
});

function runFeedingModal(g) {
    const m = openModal({ title: "Memberi pakan", icon: "restaurant", dismissable: false,
        body: `<p>Feeder berputar dan Load Cell menimbang pakan…</p><div class="pbar"><i id="pbFill"></i></div><div class="pnum"><b id="pbNum">0</b> / ${g} g</div>` });
    const t0 = performance.now(), D = 2600;
    const iv = setInterval(() => {
        const p = Math.min(1, (performance.now() - t0) / D), e = 1 - Math.pow(1 - p, 3);
        $("#pbFill", m.box).style.width = e * 100 + "%";
        $("#pbNum", m.box).textContent = Math.round(g * e);
        if (p >= 1) { clearInterval(iv); finish(); }
    }, 40);
    function finish() {
        const actual = recordFeed(g, "manual");
        renderAll();
        m.update({ title: "Pakan terkirim", icon: "check_circle", tone: "ok", dismissable: true,
            body: `<div class="done-pop"><span class="material-symbols-outlined">check_circle</span></div><p style="text-align:center">Berat aktual tertimbang <b>${actual.toFixed(1)} g</b> dari target ${g} g.</p>`,
            actions: [{ label: "Selesai", cls: "primary" }] });
        if (todayGram() > S.targetGram) showToast(`Target harian terlewati: ${todayGram()} / ${S.targetGram} g.`, "warn");
    }
}

/* Pemberian otomatis sesuai jadwal (jam perangkat) */
function autoFeed(now) {
    S.schedule.filter((s) => s.on).forEach((s) => {
        const k = `${dayKey(now)}#${s.id}`;
        if (S.fired.includes(k) || at(s.time) > now) return;
        S.fired.push(k);
        if (S.stockKg * 1000 < s.gram) {
            notify("error", "Jadwal dilewati", `${s.name} (${s.time}) gagal: stok pakan tidak cukup.`, "jadwal");
            showToast(`${s.name} gagal: stok tidak cukup.`, "warn");
        } else {
            recordFeed(s.gram, "auto");
            notify("ok", "Pemberian otomatis selesai", `${s.name}: ${s.gram} g diberikan pukul ${s.time}.`, "histori");
            showToast(`${s.name} selesai: ${s.gram} g`, "ok");
        }
        save(); renderAll();
    });
}

/* =========================================================
   TICK (tiap detik, jam perangkat)
   ========================================================= */
let sig = "";
function tick() {
    const now = new Date();
    autoFeed(now);
    $(".last-update strong").textContent = `${fmtDate(now)} · ${fmtTime(now)}`;

    const act = activeSchedule();
    let next = null, s = act.find((x) => at(x.time) > now);
    if (s) next = at(s.time); else if (act.length) { s = act[0]; next = at(s.time, -1); }
    if (next) {
        const diff = Math.max(0, Math.floor((next - now) / 1000));
        $(".countdown strong").textContent = `${pad(Math.floor(diff / 3600))}:${pad(Math.floor((diff % 3600) / 60))}:${pad(diff % 60)}`;
        $(".next-time strong").textContent = `${pad(next.getHours())}:${pad(next.getMinutes())}`;
        $(".next-time span").textContent = `${next.getDate()} ${MONTHS_ID[next.getMonth()]} ${next.getFullYear()}`;
        $(".feeding-info strong").textContent = `${s.gram} g`;
    } else {
        $(".countdown strong").textContent = "--:--:--";
        $(".next-time strong").textContent = "--:--";
        $(".next-time span").textContent = "Tidak ada jadwal aktif";
        $(".feeding-info strong").textContent = "-- g";
    }
    const ns = S.schedule.map((x) => `${x.id}${x.on}${at(x.time) <= now}`).join();
    if (ns !== sig) { sig = ns; renderTodaySchedule(); renderToday(); }
    if (now.getSeconds() === 0) renderNotifs();
}

/* =========================================================
   ROUTER
   ========================================================= */
const VIEWS = {
    overview: ["Fish Feeder Dashboard", "AQUACULTURE CONTROL SYSTEM"],
    jadwal: ["Jadwal & Persediaan", "FEEDING MANAGEMENT"],
    histori: ["Histori Pemberian Pakan", "FEEDING LOG"],
    cli: ["Web-CLI", "DEVICE CONSOLE"],
    preferensi: ["Preferensi Budidaya", "PERSONALIZATION"],
    pengaturan: ["Pengaturan", "SYSTEM SETTINGS"],
};
const PAGES = { jadwal: pageJadwal, histori: pageHistori, cli: pageCli, preferensi: pagePrefs, pengaturan: pageSettings };
const LIVE = ["jadwal", "histori"];
let cur = "overview";
const sidebar = $(".sidebar");

function route() {
    const v = location.hash.slice(1);
    cur = VIEWS[v] ? v : "overview";
    $$(".view").forEach((x) => x.classList.toggle("active", x.id === "view-" + cur));
    $$(".sidebar-menu a").forEach((a) => a.classList.toggle("active", a.dataset.view === cur));
    $("h1").textContent = VIEWS[cur][0];
    $(".eyebrow").textContent = VIEWS[cur][1];
    sidebar.classList.remove("open");
    window.scrollTo({ top: 0 });
    PAGES[cur] && PAGES[cur]();
}
function go(v) { if (location.hash === "#" + v) route(); else location.hash = v; }
window.addEventListener("hashchange", route);

$(".menu-btn").addEventListener("click", (e) => { e.stopPropagation(); sidebar.classList.toggle("open"); });
document.addEventListener("click", (e) => { if (sidebar.classList.contains("open") && !sidebar.contains(e.target)) sidebar.classList.remove("open"); });

/* =========================================================
   HALAMAN
   ========================================================= */
const head = (l, t, d) => `<section class="system-overview"><div><p class="section-label">${l}</p><h2>${t}</h2><p class="section-description">${d}</p></div></section>`;
const sel = (k, opts, v, src = "pref") => `<select data-${src}="${k}">${opts.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${val}" ${val == v ? "selected" : ""}>${lab}</option>`; }).join("")}</select>`;

/* ---------- Jadwal, stok, target ---------- */
function pageJadwal() {
    const list = [...S.schedule].sort((a, b) => a.time.localeCompare(b.time));
    const total = totalPlanned(), pct = (S.stockKg / S.capacityKg) * 100;
    const days = total ? (S.stockKg * 1000) / total : 0;
    const diff = total - S.targetGram;
    $("#view-jadwal").innerHTML = head("FEEDING MANAGEMENT", "Jadwal, Persediaan & Target", "Atur sesi pemberian otomatis, stok pakan di dalam box, dan target pakan harian.") + `
    <div class="page-grid">
      <div class="panel">
        <div class="panel-header"><div><span class="section-label">FEEDING SCHEDULE</span><h2>Jadwal Pemberian</h2></div>
            <button class="btn primary sm" data-act="add-sch"><span class="material-symbols-outlined">add</span>Tambah</button></div>
        <div class="sch-list">${list.map((s) => `
            <div class="sch-row ${s.on ? "" : "off"}"><div class="sch-time">${s.time}</div>
                <div class="sch-info"><strong>${esc(s.name)}</strong><span>${s.gram} g · Automatic</span></div>
                <label class="switch" title="Aktif / nonaktif"><input type="checkbox" data-act="toggle-sch" data-id="${s.id}" ${s.on ? "checked" : ""}><i></i></label>
                <button class="icon-btn" data-act="edit-sch" data-id="${s.id}" title="Edit"><span class="material-symbols-outlined">edit</span></button>
                <button class="icon-btn danger" data-act="del-sch" data-id="${s.id}" title="Hapus"><span class="material-symbols-outlined">delete</span></button></div>`).join("") || `<p class="empty">Belum ada jadwal.</p>`}</div>
        <div class="sum-line ${diff > 0 ? "bad" : ""}">Total jadwal aktif <strong>${total} g/hari</strong> · target harian <strong>${S.targetGram} g</strong>.
            ${diff > 0 ? `Jadwal melebihi target ${diff} g.` : diff < 0 ? `Masih ada ruang ${-diff} g untuk pemberian manual.` : "Pas dengan target."}</div>
      </div>
      <div class="stack">
        <div class="panel">
          <div class="panel-header"><div><span class="section-label">FEED AVAILABLE</span><h2>Persediaan Pakan</h2></div><span class="material-symbols-outlined panel-header-icon">inventory_2</span></div>
          <div class="big">${S.stockKg.toFixed(2)} <small>kg dari ${S.capacityKg.toFixed(2)} kg</small></div>
          <div class="stock-bar"><div class="stock-bar-fill" style="width:${Math.min(100, pct)}%;${pct < 20 ? "background:var(--red)" : ""}"></div></div>
          <p class="panel-description">${total ? `Cukup untuk sekitar <b>${days.toFixed(1)} hari</b> pada jadwal saat ini.` : "Tidak ada jadwal aktif."}</p>
          <div class="actions-row"><button class="btn primary" data-act="stock-modal"><span class="material-symbols-outlined">inventory</span>Atur / Isi ulang</button></div>
        </div>
        <div class="panel">
          <div class="panel-header"><div><span class="section-label">DAILY TARGET</span><h2>Target Harian</h2></div><span class="material-symbols-outlined panel-header-icon">flag</span></div>
          <label class="field" style="margin-top:1rem">Target pakan per hari (gram)
            <input id="tgtInput" type="number" min="50" max="5000" step="10" value="${S.targetGram}"></label>
          <p class="form-err" id="tgtErr"></p>
          <div class="actions-row" style="margin-top:.4rem"><button class="btn primary" data-act="target-save">Simpan target</button>
            <button class="btn" data-act="target-suggest">Samakan dengan jadwal (${total} g)</button></div>
        </div>
      </div>
    </div>`;
}

function schModal(s) {
    const edit = !!s;
    s = s || { name: "", time: "08:00", gram: 100 };
    openModal({ title: edit ? "Edit jadwal" : "Tambah jadwal", icon: "schedule",
        body: `<label class="field">Nama sesi<input id="fName" maxlength="24" value="${esc(s.name)}" placeholder="mis. Morning Feeding"></label>
            <div class="row2"><label class="field">Waktu<input id="fTime" type="time" value="${s.time}"></label>
            <label class="field">Porsi (g)<input id="fGram" type="number" min="10" max="250" step="5" value="${s.gram}"></label></div><p class="form-err" id="fErr"></p>`,
        actions: [{ label: "Batal" }, { label: "Simpan", cls: "primary", onClick: (box) => {
            const time = $("#fTime", box).value, gram = Math.round(Number($("#fGram", box).value)), name = $("#fName", box).value.trim() || `Sesi ${time}`;
            const err = (m) => { $("#fErr", box).textContent = m; return false; };
            if (!time) return err("Waktu wajib diisi.");
            if (!(gram >= 10 && gram <= 250)) return err("Porsi harus 10–250 g.");
            if (S.schedule.some((x) => x.time === time && x !== s)) return err("Sudah ada jadwal pada waktu itu.");
            if (edit) { Object.assign(s, { name, time, gram }); S.fired = S.fired.filter((k) => k !== `${dayKey(new Date())}#${s.id}`); }
            else S.schedule.push({ id: Math.max(0, ...S.schedule.map((x) => x.id)) + 1, name, time, gram, on: true });
            markPassed(); save(); renderAll();
            showToast(edit ? "Jadwal diperbarui." : "Jadwal ditambahkan.", "ok");
        } }] });
}

function stockModal() {
    openModal({ title: "Atur persediaan pakan", icon: "inventory_2",
        body: `<div class="row2" style="margin-top:0"><label class="field">Stok saat ini (kg)<input id="fStock" type="number" min="0" step="0.05" value="${S.stockKg.toFixed(2)}"></label>
            <label class="field">Kapasitas box (kg)<input id="fCap" type="number" min="0.5" step="0.1" value="${S.capacityKg}"></label></div><p class="form-err" id="fErr"></p>`,
        actions: [{ label: "Batal" },
            { label: "Penuhi box", onClick: (box) => { $("#fStock", box).value = Number($("#fCap", box).value || S.capacityKg).toFixed(2); return false; } },
            { label: "Simpan", cls: "primary", onClick: (box) => {
                const stock = Number($("#fStock", box).value), cap = Number($("#fCap", box).value);
                const err = (m) => { $("#fErr", box).textContent = m; return false; };
                if (!(cap >= 0.5)) return err("Kapasitas minimal 0.5 kg.");
                if (!(stock >= 0) || stock > cap) return err("Stok harus 0 sampai kapasitas box.");
                S.stockKg = +stock.toFixed(3); S.capacityKg = cap; S.lowWarned = stock / cap < 0.2;
                save(); renderAll(); showToast("Persediaan pakan diperbarui.", "ok");
            } }] });
}

/* ---------- Histori ---------- */
const hf = { mode: "all", range: "all" };
function pageHistori() {
    let rows = S.history;
    if (hf.mode !== "all") rows = rows.filter((h) => h.mode === hf.mode);
    if (hf.range === "today") rows = rows.filter((h) => dayKey(new Date(h.t)) === dayKey(new Date()));
    const sum = rows.reduce((a, h) => a + h.actual, 0);
    const dev = rows.length ? rows.reduce((a, h) => a + Math.abs(h.actual - h.target), 0) / rows.length : 0;
    const chip = (k, v, l) => `<button class="chip ${hf[k] === v ? "on" : ""}" data-act="hf" data-k="${k}" data-v="${v}">${l}</button>`;
    $("#view-histori").innerHTML = head("FEEDING LOG", "Seluruh Histori", "Catatan setiap pemberian pakan otomatis maupun manual, lengkap dengan berat target dan aktual.") + `
    <div class="panel"><div class="toolbar" style="margin-top:0"><div class="chips">${chip("mode", "all", "Semua")}${chip("mode", "auto", "Automatic")}${chip("mode", "manual", "Manual")}
        <span style="width:.6rem"></span>${chip("range", "all", "Semua waktu")}${chip("range", "today", "Hari ini")}</div>
        <div class="chips"><button class="btn sm" data-act="export"><span class="material-symbols-outlined">download</span>Ekspor CSV</button>
        <button class="btn sm" data-act="clear-hist"><span class="material-symbols-outlined">delete_sweep</span>Hapus histori</button></div></div>
      <div class="stats"><div class="stat"><span>Jumlah sesi</span><strong>${rows.length}</strong></div><div class="stat"><span>Total pakan</span><strong>${Math.round(sum)} g</strong></div>
        <div class="stat"><span>Rata-rata selisih</span><strong>${dev.toFixed(2)} g</strong></div></div>
      <div class="history-table-container"><table class="history-table"><thead><tr><th>Waktu</th><th>Berat</th><th>Mode</th><th>Target</th><th>Aktual</th><th>Status</th></tr></thead>
        <tbody>${rows.slice(0, 100).map(histRow).join("") || `<tr><td colspan="6" class="empty">Tidak ada data untuk filter ini.</td></tr>`}</tbody></table></div></div>`;
}

/* ---------- Web-CLI ---------- */
const cli = { hist: [], i: 0 };
function print(txt, cls = "") {
    const o = $("#cliOut"), d = document.createElement("div");
    d.className = cls; d.textContent = txt; o.append(d); o.scrollTop = o.scrollHeight;
}
function pageCli() {
    const v = $("#view-cli");
    if (!v.dataset.ready) {
        v.dataset.ready = 1;
        v.innerHTML = head("DEVICE CONSOLE", "Web-CLI", "Konsol untuk mengoperasikan feeder lewat perintah teks. Ketik <b>help</b> untuk daftar perintah.") + `
        <div class="term"><div class="term-bar"><i></i><i></i><i></i><span>esp32@fishfeed ~ console</span></div>
        <div class="term-out" id="cliOut"></div><form class="term-in" id="cliForm"><span>$</span><input id="cliIn" autocomplete="off" spellcheck="false" placeholder="ketik 'help'"></form></div>`;
        $("#cliForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const inp = $("#cliIn"), line = inp.value.trim();
            inp.value = "";
            if (!line) return;
            cli.hist.push(line); cli.i = cli.hist.length;
            print("$ " + line, "cmd"); runCmd(line);
        });
        $("#cliIn").addEventListener("keydown", (e) => {
            if (e.key === "ArrowUp" && cli.i > 0) { cli.i--; e.target.value = cli.hist[cli.i]; e.preventDefault(); }
            else if (e.key === "ArrowDown") { cli.i = Math.min(cli.hist.length, cli.i + 1); e.target.value = cli.hist[cli.i] || ""; e.preventDefault(); }
        });
        $(".term", v).addEventListener("click", () => { if (!getSelection().toString()) $("#cliIn").focus(); });
        print("FishFeed Console v1.0 · ESP32 terhubung", "ok");
        print("Ketik help untuk melihat perintah. Panah atas/bawah memanggil riwayat perintah.", "dim");
    }
    $("#cliIn").focus();
}

function runCmd(line) {
    const [c, ...a] = line.split(/\s+/), P = print;
    switch (c.toLowerCase()) {
        case "help":
            ["help                    daftar perintah", "status                  ringkasan perangkat dan pakan", "stock                   stok pakan di box",
             "target [gram]           lihat / ubah target harian", "feed <gram> [--force]   beri pakan manual (10-250 g)", "schedule                daftar jadwal",
             "history [n]             n riwayat terakhir", "time                    jam perangkat", "theme <light|dark>     ganti tema",
             "goto <halaman>          overview, jadwal, histori, preferensi, pengaturan", "reboot                  simulasi restart ESP32", "clear                   bersihkan layar"].forEach((t) => P(t));
            break;
        case "status": {
            const act = activeSchedule();
            P("ESP32      : online  | WiFi: connected", "ok");
            P(`Load cell  : HX711 normal | Motor: NEMA 17 ready`);
            P(`Stok pakan : ${S.stockKg.toFixed(2)} / ${S.capacityKg.toFixed(2)} kg`);
            P(`Hari ini   : ${todayGram()} / ${S.targetGram} g | jadwal aktif: ${act.length}`);
            break;
        }
        case "stock": P(`${S.stockKg.toFixed(2)} kg dari ${S.capacityKg.toFixed(2)} kg (${Math.round((S.stockKg / S.capacityKg) * 100)}%)`); break;
        case "target":
            if (!a[0]) return P(`Target harian: ${S.targetGram} g`);
            if (!(+a[0] >= 50 && +a[0] <= 5000)) return P("Gunakan: target <50-5000>", "err");
            S.targetGram = Math.round(+a[0]); save(); renderAll(); P(`Target harian diubah menjadi ${S.targetGram} g`, "ok"); break;
        case "feed": {
            const g = parseInt(a[0], 10);
            if (!(g >= 10 && g <= 250)) return P("Gunakan: feed <10-250> [--force]", "err");
            if (g > S.stockKg * 1000) return P(`Stok tidak cukup (${Math.round(S.stockKg * 1000)} g tersisa).`, "err");
            const now = todayGram();
            if (now + g > S.targetGram && !a.includes("--force")) return P(`PERINGATAN: total hari ini jadi ${now + g} g, melewati target ${S.targetGram} g. Tambahkan --force untuk melanjutkan.`, "warn");
            P("Menimbang pakan…", "dim");
            setTimeout(() => { const x = recordFeed(g, "manual"); renderAll(); P(`OK: target ${g} g, aktual ${x.toFixed(1)} g.`, "ok"); }, 900);
            break;
        }
        case "schedule": activeSchedule().forEach((s) => P(`${s.time}  ${String(s.gram).padStart(3)} g  ${s.name}`)); if (!activeSchedule().length) P("Tidak ada jadwal aktif.", "dim"); break;
        case "history": {
            const n = Math.min(20, parseInt(a[0], 10) || 5);
            S.history.slice(0, n).forEach((h) => { const d = new Date(h.t); P(`${fmtDate(d)} ${fmtTime(d)}  ${h.mode.padEnd(6)} ${h.target} g -> ${h.actual.toFixed(1)} g`); });
            break;
        }
        case "time": P(`${new Date().toString()}`); break;
        case "theme":
            if (!["light", "dark"].includes(a[0])) return P("Gunakan: theme <light|dark>", "err");
            S.settings.theme = a[0]; save(); applyTheme(); P(`Tema: ${a[0]}`, "ok"); break;
        case "goto":
            if (!VIEWS[a[0]]) return P("Halaman: " + Object.keys(VIEWS).join(", "), "err");
            go(a[0]); break;
        case "reboot":
            P("Restarting ESP32…", "warn");
            setTimeout(() => P("Menghubungkan WiFi…", "dim"), 800);
            setTimeout(() => P("Load cell dikalibrasi ulang.", "dim"), 1600);
            setTimeout(() => P("ESP32 online.", "ok"), 2400); break;
        case "clear": $("#cliOut").innerHTML = ""; break;
        default: P(`Perintah tidak dikenal: ${c}. Ketik help.`, "err");
    }
}

/* ---------- Preferensi ---------- */
function pagePrefs() {
    const p = S.prefs;
    $("#view-preferensi").innerHTML = head("PERSONALIZATION", "Preferensi Budidaya", "Data ini menentukan isi panel Profil Budidaya dan rekomendasi artikel di sisi kanan. Perubahan langsung tersimpan.") + `
    <div class="panel"><div class="panel-header"><div><span class="section-label">FARM PROFILE</span><h2>Profil Budidaya</h2></div><span class="material-symbols-outlined panel-header-icon">set_meal</span></div>
      <div class="form-grid">
        <label class="field">Spesies ikan${sel("species", Object.entries(SPECIES).map(([k, v]) => [k, v.name]), p.species)}</label>
        <label class="field">Fase budidaya${sel("stage", ["Grow-out", "Nursery", "Broodstock"], p.stage)}</label>
        <label class="field">Sistem budidaya${sel("system", ["Freshwater pond", "Tank", "Floating cage", "Biofloc"], p.system)}</label>
        <label class="field">Populasi (ekor)<input type="number" min="1" step="10" data-pref="population" value="${p.population}"></label>
        <label class="field">Berat rata-rata (g)<input type="number" min="1" step="1" data-pref="avgWeight" value="${p.avgWeight}"></label>
        <label class="field">Tujuan pemberian${sel("goal", ["Growth", "Maintenance", "Breeding"], p.goal)}</label>
        <label class="field">Jenis pakan${sel("feedType", ["Pellet", "Floating pellet", "Sinking pellet", "Crumble"], p.feedType)}</label>
        <label class="field">Topik artikel favorit${sel("topic", ARTICLES.map((a) => [a.id, a.topic]), p.topic)}</label>
      </div>
      <div class="actions-row"><button class="btn" data-act="pref-reset"><span class="material-symbols-outlined">restart_alt</span>Kembalikan default</button></div></div>`;
}

/* ---------- Pengaturan ---------- */
function pageSettings() {
    const st = S.settings;
    $("#view-pengaturan").innerHTML = head("SYSTEM SETTINGS", "Pengaturan", "Tampilan, notifikasi, akun, dan data aplikasi.") + `
    <div class="page-grid">
      <div class="panel"><div class="panel-header"><div><span class="section-label">TAMPILAN & NOTIFIKASI</span><h2>Umum</h2></div></div>
        <div class="set-row"><div>Tema<small>Terang, gelap, atau ikuti perangkat.</small></div><label class="field">${sel("theme", [["system", "Ikuti perangkat"], ["light", "Terang"], ["dark", "Gelap"]], st.theme, "set")}</label></div>
        <div class="set-row"><div>Peringatan stok menipis<small>Notifikasi saat sisa pakan di bawah 20%.</small></div><label class="switch"><input type="checkbox" data-set="notifLow" ${st.notifLow ? "checked" : ""}><i></i></label></div>
        <div class="set-row"><div>Peringatan target harian<small>Notifikasi saat total pakan melewati target.</small></div><label class="switch"><input type="checkbox" data-set="notifOver" ${st.notifOver ? "checked" : ""}><i></i></label></div>
        <div class="set-row"><div>Zona waktu<small>Mengikuti jam perangkat Anda.</small></div><strong>${Intl.DateTimeFormat().resolvedOptions().timeZone}</strong></div></div>
      <div class="stack"><div class="panel"><div class="panel-header"><div><span class="section-label">AKUN</span><h2>Profil</h2></div></div>
        <div class="form-grid" style="grid-template-columns:1fr"><label class="field">Nama<input data-set="userName" maxlength="20" value="${esc(st.userName)}"></label>
        <label class="field">Nama tambak<input data-set="farmName" maxlength="24" value="${esc(st.farmName)}"></label></div></div>
        <div class="panel"><div class="panel-header"><div><span class="section-label">DATA</span><h2>Data aplikasi</h2></div></div>
        <p class="panel-description">Semua data tersimpan di browser ini. Menghapusnya mengembalikan aplikasi ke kondisi awal.</p>
        <div class="actions-row"><button class="btn danger" data-act="reset"><span class="material-symbols-outlined">delete_forever</span>Reset semua data</button></div></div></div>
    </div>`;
}

/* =========================================================
   AKSI (event delegation)
   ========================================================= */
const findSch = (id) => S.schedule.find((s) => s.id === +id);
const ACT = {
    go: (el) => go(el.dataset.v),
    "add-sch": () => schModal(),
    "edit-sch": (el) => schModal(findSch(el.dataset.id)),
    "del-sch": async (el) => {
        const s = findSch(el.dataset.id);
        if (await confirmModal({ title: "Hapus jadwal", icon: "delete", tone: "danger", okText: "Hapus", message: `Hapus jadwal <b>${esc(s.name)}</b> (${s.time})?` })) {
            S.schedule = S.schedule.filter((x) => x !== s); save(); renderAll(); showToast("Jadwal dihapus.", "ok");
        }
    },
    "stock-modal": () => stockModal(),
    "target-save": () => {
        const v = Math.round(Number($("#tgtInput").value));
        if (!(v >= 50 && v <= 5000)) return ($("#tgtErr").textContent = "Target harus 50–5000 g.");
        S.targetGram = v; save(); renderAll(); showToast("Target harian disimpan.", "ok");
    },
    "target-suggest": () => { S.targetGram = Math.max(50, totalPlanned()); save(); renderAll(); showToast(`Target disamakan dengan jadwal: ${S.targetGram} g.`, "ok"); },
    hf: (el) => { hf[el.dataset.k] = el.dataset.v; pageHistori(); },
    export: () => {
        const rows = ["waktu,mode,target_g,aktual_g", ...S.history.map((h) => { const d = new Date(h.t); return `${dayKey(d)} ${fmtTime(d)},${h.mode},${h.target},${h.actual}`; })];
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
        a.download = "histori-pakan.csv"; a.click(); URL.revokeObjectURL(a.href);
    },
    "clear-hist": async () => {
        if (await confirmModal({ title: "Hapus histori", icon: "delete_sweep", tone: "danger", okText: "Hapus", message: "Seluruh riwayat pemberian pakan akan dihapus dan tidak bisa dikembalikan." })) {
            S.history = []; save(); renderAll(); showToast("Histori dihapus.", "ok");
        }
    },
    "art-sum": (el) => {
        const a = ARTICLES.find((x) => x.id === el.dataset.id);
        openModal({ title: a.tag, icon: "article", body: `<p><b>${esc(a.title)}</b></p><p style="margin-top:.5rem">${esc(a.sum)}</p><p class="muted" style="margin-top:.6rem">${a.src} · ${a.year}</p>`,
            actions: [{ label: "Tutup" }, { label: "Buka artikel", cls: "primary", onClick: () => { window.open(a.url, "_blank", "noopener,noreferrer"); } }] });
    },
    "open-notif": (el) => {
        const n = S.notifs.find((x) => x.id === +el.dataset.id);
        if (n) { n.read = true; save(); renderNotifs(); if (n.link) go(n.link); }
    },
    "read-all": () => { S.notifs.forEach((n) => (n.read = true)); save(); renderNotifs(); },
    profile: () => openModal({ title: "Profil saya", icon: "account_circle",
        body: `<label class="field">Nama<input id="fUser" maxlength="20" value="${esc(S.settings.userName)}"></label><label class="field" style="margin-top:.8rem">Nama tambak<input id="fFarm" maxlength="24" value="${esc(S.settings.farmName)}"></label>`,
        actions: [{ label: "Batal" }, { label: "Simpan", cls: "primary", onClick: (box) => {
            S.settings.userName = $("#fUser", box).value.trim() || "Saya"; S.settings.farmName = $("#fFarm", box).value.trim() || "Fish Farm";
            save(); renderHeader(); showToast("Profil diperbarui.", "ok");
        } }] }),
    help: () => openModal({ title: "Bantuan", icon: "help",
        body: `<ul><li><b>Overview</b>: pantau stok, jadwal berikutnya, dan beri pakan manual.</li><li><b>Jadwal Pakan</b>: atur sesi otomatis, stok box, dan target harian.</li>
            <li><b>Web-CLI</b>: operasikan feeder lewat perintah teks (ketik <b>help</b>).</li><li><b>Preferensi</b>: ubah profil budidaya dan rekomendasi artikel di panel kanan.</li>
            <li>Tekan <b>Esc</b> untuk menutup pop up.</li></ul>`, actions: [{ label: "Mengerti", cls: "primary" }] }),
    logout: async () => { if (await confirmModal({ title: "Keluar", icon: "logout", okText: "Keluar", message: "Anda yakin ingin keluar dari dashboard?" })) showToast("Anda telah keluar (demo — belum ada sistem login).", "ok"); },
    reset: async () => {
        if (await confirmModal({ title: "Reset semua data", icon: "warning", tone: "danger", okText: "Reset", message: "Jadwal, histori, preferensi, dan pengaturan akan dikembalikan ke awal." })) {
            try { localStorage.removeItem("fishfeed"); } catch (e) {} location.reload();
        }
    },
    "pref-reset": () => { S.prefs = { ...DEFAULTS.prefs }; save(); renderProfile(); renderReco(); pagePrefs(); showToast("Preferensi dikembalikan.", "ok"); },
};

document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.matches("input")) return;
    const dd = el.closest(".dropdown");
    if (dd) { dd.classList.remove("open"); dd.classList.add("suppress"); }
    ACT[el.dataset.act]?.(el, e);
});

document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.act === "toggle-sch") { findSch(t.dataset.id).on = t.checked; markPassed(); save(); renderAll(); return; }
    if (t.dataset.pref) {
        const k = t.dataset.pref; let v = t.value;
        if (t.type === "number") { v = Number(v); if (!(v > 0)) { t.value = S.prefs[k]; return; } }
        S.prefs[k] = v; save(); renderProfile(); renderReco(); return;
    }
    if (t.dataset.set) {
        const k = t.dataset.set;
        let v = t.type === "checkbox" ? t.checked : t.value.trim();
        if (k === "userName") v = v || "Saya"; if (k === "farmName") v = v || "Fish Farm";
        S.settings[k] = v; save();
        if (k === "theme") applyTheme(); else renderHeader();
    }
});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);

/* =========================================================
   INIT
   ========================================================= */
function renderAll() {
    renderStock(); renderToday(); renderTodaySchedule(); renderRecent();
    renderProfile(); renderReco(); renderHeader(); renderNotifs();
    if (LIVE.includes(cur)) PAGES[cur]();
}

if (!S.seeded) seed();
markPassed();
save();
applyTheme();
renderAll();
route();
tick();
setInterval(tick, 1000);