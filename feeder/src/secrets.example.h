/*
 * =====================================================================
 *  FishFeed — TEMPLATE kredensial firmware
 * =====================================================================
 *  Cara pakai:
 *    1. Copy file ini menjadi "secrets.h" di folder yang sama:
 *         cp secrets.example.h secrets.h
 *    2. Isi SSID & password WiFi asli Anda di secrets.h.
 *    3. secrets.h sudah masuk .gitignore → TIDAK akan ikut ke Git.
 *
 *  JANGAN commit secrets.h. File ini (contoh) aman untuk di-commit.
 * =====================================================================
 */

#ifndef FEEDER_SECRETS_H
#define FEEDER_SECRETS_H

// Hotspot/router 2.4 GHz — ESP32 tidak mendukung jaringan 5 GHz.
const char* WIFI_SSID = "NAMA_WIFI_ANDA";
const char* WIFI_PASS = "PASSWORD_WIFI_ANDA";

#endif
