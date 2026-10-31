/*
 * =====================================================================
 *  FishFeed — Firmware ESP32 (Feeder Ikan Otomatis)
 *  Kelompok 4 · Paralel 2 · Sistem Instrumentasi Berbasis Internet
 * =====================================================================
 *  Alur (sesuai diagram blok & alur logika):
 *    Load Cell → HX711 → ESP32 → Driver (A4988/DRV8825) → Stepper NEMA17
 *    ESP32  ↔  Broker MQTT  ↔  Website (dashboard)
 *
 *  Fitur firmware:
 *    - Baca berat hopper (Load Cell + HX711)
 *    - Timbang pakan presisi: motor berputar sampai berat turun >= target
 *    - Terima perintah lewat MQTT: feed, stop, tare, calibrate, schedule_set
 *    - Jadwal disimpan di NVS (Preferences) → tetap ada setelah restart
 *    - Publish status (retained) + event hasil pemberian + reply per perintah
 *    - Last Will → dashboard tahu saat ESP32 mati/putus
 *
 *  LIBRARY (install lewat Library Manager):
 *    - PubSubClient        (Nick O'Leary)
 *    - ArduinoJson  v7     (Benoit Blanchon)
 *    - HX711               (Bogdan Necula)
 *    - Preferences         (bawaan ESP32 core)
 *  Board: ESP32 Dev Module.
 *
 *  TOPIK (harus sama dengan dashboard / simulator):
 *    feeder/{id}/status      (retained)  {online,weight_kg,motor,rssi,ts}
 *    feeder/{id}/event                   {id,ts,mode,target,actual,status,duration,stock_after,samples}
 *    feeder/{id}/cmd                     {id,cmd,...}
 *    feeder/{id}/cmd/reply               {id,ok,message}
 *    feeder/{id}/schedule    (retained)  [{id,name,time,gram,days,on}]
 *
 *  CATATAN PENTING:
 *    - Dashboard/browser memakai WSS (8084), ESP32 memakai TCP (1883).
 *      Keduanya di broker yang SAMA (broker.emqx.io) → topiknya tersambung.
 *    - Untuk broker ber-TLS (mis. HiveMQ Cloud 8883) ganti WiFiClient
 *      menjadi WiFiClientSecure + sertakan CA certificate.
 *    - Jam perangkat butuh NTP (internet) agar jadwal & timestamp benar.
 * =====================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <HX711.h>
#include <Preferences.h>
#include <math.h>
#include <vector>

/* ================= KONFIGURASI (UBAH SESUAI HARDWARE) ================= */
// Kredensial WiFi ada di secrets.h (lokal, tidak ikut Git).
// Salin secrets.example.h -> secrets.h lalu isi SSID & password Anda.
#include "secrets.h"

const char* MQTT_HOST = "broker.emqx.io";
const uint16_t MQTT_PORT = 1883;            // non-TLS; WSS browser pakai 8084
const char* DEVICE_ID = "demo-01";          // harus sama dengan dashboard

// Pin HX711 (Load Cell)
#define HX_DT   16
#define HX_SCK  4

// Pin motor stepper (A4988 / DRV8825)
#define STEP_PIN  26
#define DIR_PIN   27
#define ENA_PIN   14   // aktif LOW (A4988/DRV8825): LOW = motor aktif

// Parameter penakaran
const float STEPS_PER_GRAM = 120.0f;        // langkah per gram (kasar; ground truth = load cell)
const int   STEP_INTERVAL_US = 800;         // kecepatan motor (us / step)
const unsigned long FEED_TIMEOUT_MS = 30000;      // timeout motor (PRD: jangan diam saat gagal)
const unsigned long STATUS_INTERVAL_MS = 5000;    // kirim status tiap 5 detik
/* ====================================================================== */

WiFiClient espClient;
PubSubClient mqtt(espClient);
HX711 scale;
Preferences prefs;

/* ---------- State motor & pemberian ---------- */
enum FeedState { FS_IDLE, FS_DISPENSING };
FeedState feedState = FS_IDLE;
String feedCmdId = "", feedMode = "manual";
int    feedTargetG = 0;
float  feedStartWeightG = 0.0f;
float  feedDispensedG = 0.0f;
unsigned long feedStartMs = 0, lastStepUs = 0, lastWeightMs = 0;
bool stopRequested = false;

unsigned long lastStatusMs = 0, lastSchedMs = 0, lastWifiAttempt = 0;
String lastFiredKey = "";

/* ---------- Struktur jadwal (days: 0=Senin .. 6=Minggu) ---------- */
struct Schedule {
  int id;
  String name;
  String time;      // "HH:MM"
  int gram;
  bool days[7];
  bool on;
};
std::vector<Schedule> schedules;

/* ================= TOPIK ================= */
String statusTopic()   { return "feeder/" + String(DEVICE_ID) + "/status"; }
String eventTopic()    { return "feeder/" + String(DEVICE_ID) + "/event"; }
String cmdTopic()      { return "feeder/" + String(DEVICE_ID) + "/cmd"; }
String replyTopic()    { return "feeder/" + String(DEVICE_ID) + "/cmd/reply"; }
String scheduleTopic() { return "feeder/" + String(DEVICE_ID) + "/schedule"; }

uint64_t nowMs() {
  return (uint64_t)time(nullptr) * 1000ULL + (millis() % 1000);
}

/* ================= MOTOR ================= */
void startMotor() { digitalWrite(DIR_PIN, HIGH); digitalWrite(ENA_PIN, LOW); }   // LOW = enable
void stopMotor()  { digitalWrite(ENA_PIN, HIGH); digitalWrite(STEP_PIN, LOW); }

/* ================= MQTT (publish helper) ================= */
bool publishJson(const String& topic, JsonDocument& doc, bool retained) {
  char buf[768];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (n == 0 || n >= sizeof(buf)) return false;
  return mqtt.publish(topic.c_str(), (uint8_t*)buf, n, retained);
}

void publishStatus() {
  JsonDocument doc;
  doc["online"] = true;
  doc["weight_kg"] = roundf(scale.get_units(3)) / 1000.0f;   // gram -> kg
  doc["motor"] = (feedState == FS_DISPENSING) ? "running" : "idle";
  doc["rssi"] = WiFi.RSSI();
  doc["ts"] = nowMs();
  publishJson(statusTopic(), doc, true);
}

void publishReply(const String& id, bool ok, const String& message) {
  JsonDocument doc;
  doc["id"] = id;
  doc["ok"] = ok;
  doc["message"] = message;
  publishJson(replyTopic(), doc, false);
}

void publishEvent(const String& id, const String& mode, int target, float actual,
                  const char* status, unsigned long durMs, const String& message) {
  JsonDocument doc;
  doc["id"] = id;
  doc["ts"] = nowMs();
  doc["mode"] = mode;
  doc["target"] = target;
  doc["actual"] = roundf(actual * 10.0f) / 10.0f;
  doc["status"] = status;
  doc["duration"] = (int)(durMs / 1000);
  doc["stock_after"] = roundf(scale.get_units(3)) / 1000.0f;
  if (message.length()) doc["message"] = message;
  JsonArray smp = doc["samples"].to<JsonArray>();
  for (int i = 1; i <= 8; i++) {
    JsonObject o = smp.add<JsonObject>();
    o["t"] = i;
    o["w"] = roundf(actual * i / 8.0f * 10.0f) / 10.0f;
  }
  publishJson(eventTopic(), doc, false);
}

void publishSchedule() {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (auto &s : schedules) {
    JsonObject o = arr.add<JsonObject>();
    o["id"] = s.id; o["name"] = s.name; o["time"] = s.time; o["gram"] = s.gram; o["on"] = s.on;
    JsonArray d = o["days"].to<JsonArray>();
    for (int i = 0; i < 7; i++) d.add(s.days[i]);
  }
  char buf[1024];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (n && n < sizeof(buf)) mqtt.publish(scheduleTopic().c_str(), (uint8_t*)buf, n, true);
}

/* ================= PEMBERIAN PAKAN (state machine) ================= */
void startFeed(int targetG, const String& mode, const String& cmdId) {
  if (feedState == FS_DISPENSING) {
    if (cmdId.length()) publishReply(cmdId, false, "Motor sedang sibuk");
    return;
  }
  feedTargetG = targetG;
  feedMode = mode;
  feedCmdId = cmdId;
  feedStartWeightG = scale.get_units(3);
  feedDispensedG = 0.0f;
  feedStartMs = millis();
  stopRequested = false;
  feedState = FS_DISPENSING;
  startMotor();
  Serial.printf("[feed] mulai: target %d g, berat awal %.1f g\n", targetG, feedStartWeightG);
}

void finishFeed(float actual, const char* status, const String& message) {
  stopMotor();
  feedState = FS_IDLE;
  stopRequested = false;
  publishEvent(feedCmdId, feedMode, feedTargetG, actual, status, millis() - feedStartMs, message);
  publishReply(feedCmdId, strcmp(status, "ok") == 0, message.length() ? message : String("OK"));
  publishStatus();
  Serial.printf("[feed] selesai: %.1f g (target %d g) status=%s\n", actual, feedTargetG, status);
}

void handleFeedState() {
  if (feedState != FS_DISPENSING) return;

  // putar motor (non-blocking)
  if (micros() - lastStepUs >= STEP_INTERVAL_US) {
    lastStepUs = micros();
    digitalWrite(STEP_PIN, HIGH);
    delayMicroseconds(5);
    digitalWrite(STEP_PIN, LOW);
  }

  // baca berat secara berkala; dispensed = penurunan berat hopper
  if (millis() - lastWeightMs >= 250) {
    lastWeightMs = millis();
    float nowWeight = scale.get_units(2);
    feedDispensedG = feedStartWeightG - nowWeight;

    if (stopRequested) { finishFeed(feedDispensedG, "ok", "Dihentikan manual"); return; }
    if (feedDispensedG >= feedTargetG) { finishFeed(feedDispensedG, "ok", ""); return; }
    if (millis() - feedStartMs > FEED_TIMEOUT_MS) { finishFeed(feedDispensedG, "gagal", "Timeout motor — berat tidak bertambah"); return; }
  }
}

/* ================= JADWAL ================= */
void saveSchedule() {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (auto &s : schedules) {
    JsonObject o = arr.add<JsonObject>();
    o["id"] = s.id; o["name"] = s.name; o["time"] = s.time; o["gram"] = s.gram; o["on"] = s.on;
    JsonArray d = o["days"].to<JsonArray>();
    for (int i = 0; i < 7; i++) d.add(s.days[i]);
  }
  String out; serializeJson(doc, out);
  prefs.putString("schedule", out);
  publishSchedule();
}

void loadSchedule() {
  String in = prefs.getString("schedule", "");
  if (!in.length()) return;
  JsonDocument doc;
  if (deserializeJson(doc, in)) return;
  schedules.clear();
  JsonArray arr = doc.as<JsonArray>();
  int i = 0;
  for (JsonVariant v : arr) {
    JsonObject o = v.as<JsonObject>();
    Schedule s;
    s.id = (o["id"] | (i + 1)).as<int>();
    s.name = (o["name"] | "Sesi").as<String>();
    s.time = (o["time"] | "00:00").as<String>();
    s.gram = (o["gram"] | 100).as<int>();
    s.on = (o["on"] | true).as<bool>();
    for (int j = 0; j < 7; j++) s.days[j] = false;
    JsonArray d = o["days"].as<JsonArray>();
    int j = 0; for (JsonVariant b : d) { if (j < 7) s.days[j++] = b.as<bool>(); }
    schedules.push_back(s);
    i++;
  }
  Serial.printf("[schedule] %d jadwal dimuat dari NVS\n", schedules.size());
}

void handleScheduleSet(JsonVariant schedVar) {
  JsonArray arr = schedVar.as<JsonArray>();
  schedules.clear();
  int i = 0;
  for (JsonVariant v : arr) {
    JsonObject o = v.as<JsonObject>();
    Schedule s;
    s.id = (o["id"] | (i + 1)).as<int>();
    s.name = (o["name"] | "Sesi").as<String>();
    s.time = (o["time"] | "00:00").as<String>();
    s.gram = (o["gram"] | 100).as<int>();
    s.on = (o["on"] | true).as<bool>();
    for (int j = 0; j < 7; j++) s.days[j] = false;
    JsonArray d = o["days"].as<JsonArray>();
    int j = 0; for (JsonVariant b : d) { if (j < 7) s.days[j++] = b.as<bool>(); }
    schedules.push_back(s);
    i++;
  }
  saveSchedule();   // simpan ke NVS + publish retained
  Serial.printf("[schedule] %d jadwal disimpan\n", schedules.size());
}

void checkSchedule() {
  struct tm t;
  if (!getLocalTime(&t, 20)) return;           // butuh NTP
  char now[6]; snprintf(now, sizeof(now), "%02d:%02d", t.tm_hour, t.tm_min);
  String key = String(t.tm_year) + "-" + t.tm_mon + "-" + t.tm_mday + "-" + now;
  if (key == lastFiredKey) return;             // cegah eksekusi ganda di menit yang sama
  lastFiredKey = key;
  int dow = (t.tm_wday + 6) % 7;               // 0 = Senin
  for (auto &s : schedules) {
    if (s.on && s.days[dow] && s.time == String(now)) {
      Serial.printf("[schedule] trigger %s (%d g)\n", s.time.c_str(), s.gram);
      startFeed(s.gram, "auto", "auto-" + key);
    }
  }
}

/* ================= KALIBRASI ================= */
void loadCalibration() {
  float f = prefs.getFloat("calFactor", 0.0f);
  if (f > 0) {
    scale.set_scale(f);
    scale.set_offset(prefs.getLong("offset", 0));
    Serial.printf("[cal] dimuat: factor=%.2f offset=%ld\n", f, prefs.getLong("offset", 0));
  } else {
    scale.set_scale(2280.0f);   // nilai contoh (1kg cell, gain 128) — segera kalibrasi
    Serial.println("[cal] BELUM dikalibrasi — jalankan tare lalu calibrate <massa>");
  }
}
void saveCalibration() {
  prefs.putFloat("calFactor", scale.get_scale());
  prefs.putLong("offset", scale.get_offset());
}
void calibrateScale(float knownGrams) {
  long v = scale.get_value(10);               // offset sudah dikurangi (setelah tare)
  if (v == 0) { Serial.println("[cal] pembacaan 0 — pastikan massa acuan diletakkan"); return; }
  scale.set_scale((float)v / knownGrams);
  saveCalibration();
  Serial.printf("[cal] selesai: factor=%.2f\n", scale.get_scale());
}

/* ================= MQTT CALLBACK ================= */
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String tp(topic);
  if (tp != cmdTopic()) return;

  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;

  String cmd = doc["cmd"] | "";
  String id  = doc["id"]  | "";
  Serial.printf("[cmd] %s (id=%s)\n", cmd.c_str(), id.c_str());

  if (cmd == "feed") {
    int w = doc["weight"] | 100;
    startFeed(w, "manual", id);
  }
  else if (cmd == "stop") {
    if (feedState == FS_DISPENSING) { stopRequested = true; publishReply(id, true, "Motor akan dihentikan"); }
    else { stopMotor(); publishReply(id, true, "Motor berhenti"); }
    publishStatus();
  }
  else if (cmd == "tare") {
    scale.tare();
    saveCalibration();
    publishReply(id, true, "Tare OK");
    publishStatus();
  }
  else if (cmd == "calibrate") {
    float m = doc["mass"] | 0.0f;
    if (m > 0) calibrateScale(m);
    publishReply(id, m > 0, m > 0 ? "Kalibrasi OK" : "massa tidak valid");
  }
  else if (cmd == "schedule_set") {
    handleScheduleSet(doc["schedule"]);
    publishReply(id, true, "Jadwal tersimpan");
  }
  else if (cmd == "status") {
    publishStatus();
    publishReply(id, true, "OK");
  }
  else if (cmd == "reboot") {
    publishReply(id, true, "Restart");
    mqtt.loop(); delay(150);
    ESP.restart();
  }
  else {
    publishReply(id, false, "Perintah tidak dikenal");
  }
}

/* ================= KONEKSI ================= */
void connectWiFi() {
  Serial.printf("[wifi] menghubungi %s ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) { delay(400); Serial.print("."); }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[wifi] terhubung, IP=%s RSSI=%d\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");   // WIB (UTC+7)
  } else {
    Serial.println("\n[wifi] gagal — mencoba lagi");
  }
}

void connectMQTT() {
  if (mqtt.connected()) return;
  Serial.printf("[mqtt] menghubungi %s:%d ...\n", MQTT_HOST, MQTT_PORT);
  String will = "{\"online\":false,\"weight_kg\":0,\"motor\":\"idle\",\"rssi\":0,\"ts\":0}";
  String cid = "esp32-" + String(DEVICE_ID);
  if (mqtt.connect(cid.c_str(), nullptr, nullptr, statusTopic().c_str(), 1, true, will.c_str())) {
    mqtt.subscribe(cmdTopic().c_str());
    Serial.println("[mqtt] terhubung");
    publishStatus();      // retained: browser baru langsung dapat data terakhir
    publishSchedule();    // retained: jadwal tersedia untuk dashboard
  } else {
    Serial.printf("[mqtt] gagal rc=%d — coba lagi\n", mqtt.state());
  }
}

/* ================= SETUP & LOOP ================= */
void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(STEP_PIN, OUTPUT);
  pinMode(DIR_PIN, OUTPUT);
  pinMode(ENA_PIN, OUTPUT);
  stopMotor();

  scale.begin(HX_DT, HX_SCK);

  prefs.begin("fishfeed", false);
  loadCalibration();
  loadSchedule();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(1024);   // WAJIB: default 256 byte terlalu kecil untuk payload schedule


  connectWiFi();
  lastStatusMs = lastSchedMs = lastWifiAttempt = millis();

  Serial.println("\n=== FishFeed ESP32 siap ===");
  Serial.println("Perintah: feed / stop / tare / calibrate <massa> / schedule_set / status / reboot");
}

void loop() {
  // WiFi auto-reconnect (non-blocking)
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiAttempt > 5000) {
    lastWifiAttempt = millis();
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }

  if (mqtt.connected()) {
    mqtt.loop();
  } else {
    connectMQTT();
  }

  handleFeedState();

  unsigned long now = millis();
  if (now - lastSchedMs >= 1000) { lastSchedMs = now; checkSchedule(); }
  if (now - lastStatusMs >= STATUS_INTERVAL_MS) { lastStatusMs = now; publishStatus(); }
}
