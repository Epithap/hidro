/*
 * ==================================================================================
 * SKADUTA NEXTGEN & WOKWI ESP32 IoT LAB FIRMWARE
 * Proyek: Upik Smart IoT Test Bench (4 Lampu & Multi Sensor)
 * Database: https://smart-agriculture-316d0-default-rtdb.firebaseio.com/
 * ==================================================================================
 * 
 * Dependencies untuk Wokwi (libraries.txt):
 * - DHT sensor library for ESPx (atau DHT sensor library by Adafruit)
 * - ArduinoJson by Benoit Blanchon
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHTesp.h"

// --- KONFIGURASI WIFI WOKWI ---
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// --- KONFIGURASI FIREBASE REALTIME DATABASE ---
const String FIREBASE_HOST = "https://smart-agriculture-316d0-default-rtdb.firebaseio.com";
const String FIREBASE_AUTH = "AIzaSyDRtm0CGH0Whia-odsOpk6o0nJlT8gJi9I";

// --- PIN ASSIGNMENT ---
// 4 Lampu LED
const int PIN_LED1 = 2;   // Lampu 1 (Merah)
const int PIN_LED2 = 4;   // Lampu 2 (Kuning)
const int PIN_LED3 = 5;   // Lampu 3 (Hijau)
const int PIN_LED4 = 18;  // Lampu 4 (Biru)

// Sensor DHT22 (Suhu & Kelembaban)
const int PIN_DHT = 15;
DHTesp dhtSensor;

// Sensor Ultrasonic HC-SR04 (Jarak)
const int PIN_TRIG = 12;
const int PIN_ECHO = 14;

// Sensor Cahaya LDR (Analog ADC1)
const int PIN_LDR = 34;

// Sensor Gerak PIR (Digital)
const int PIN_PIR = 27;

// Timer interval pengiriman telemetri
unsigned long previousMillis = 0;
const long interval = 2500; // Kirim tiap 2.5 detik

// Status lampu lokal
bool statusLampu1 = false;
bool statusLampu2 = false;
bool statusLampu3 = false;
bool statusLampu4 = false;

// Fungsi baca jarak dari HC-SR04
float readDistanceCM() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duration = pulseIn(PIN_ECHO, HIGH, 30000); // timeout 30ms
  if (duration == 0) return 0.0;
  return duration * 0.034 / 2.0;
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=============================================");
  Serial.println("  UPIK IOT LAB - ESP32 WOKWI FIRMWARE READY  ");
  Serial.println("=============================================");

  // Inisialisasi Pin Output LED
  pinMode(PIN_LED1, OUTPUT);
  pinMode(PIN_LED2, OUTPUT);
  pinMode(PIN_LED3, OUTPUT);
  pinMode(PIN_LED4, OUTPUT);
  digitalWrite(PIN_LED1, LOW);
  digitalWrite(PIN_LED2, LOW);
  digitalWrite(PIN_LED3, LOW);
  digitalWrite(PIN_LED4, LOW);

  // Inisialisasi Pin Sensor
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_LDR, INPUT);
  pinMode(PIN_PIR, INPUT);

  // Inisialisasi DHT
  dhtSensor.setup(PIN_DHT, DHTesp::DHT22);

  // Koneksi WiFi Wokwi
  Serial.print("Menghubungkan ke WiFi Wokwi-GUEST");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retryCount = 0;
  while (WiFi.status() != WL_CONNECTED && retryCount < 25) {
    delay(400);
    Serial.print(".");
    retryCount++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Berhasil terhubung! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WIFI] Mode simulasi offline (WiFi timeout).");
  }
}

// Fungsi sinkronisasi status 4 Lampu dari Firebase
void fetchLampControls() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  // Cek node /wokwi_iot/lamps.json atau /agriculture_iot/relays.json
  String url = FIREBASE_HOST + "/wokwi_iot/lamps.json";
  http.begin(url);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      if (doc.containsKey("lampu1")) statusLampu1 = doc["lampu1"].as<bool>();
      if (doc.containsKey("lampu2")) statusLampu2 = doc["lampu2"].as<bool>();
      if (doc.containsKey("lampu3")) statusLampu3 = doc["lampu3"].as<bool>();
      if (doc.containsKey("lampu4")) statusLampu4 = doc["lampu4"].as<bool>();

      // Terapkan ke pin hardware
      digitalWrite(PIN_LED1, statusLampu1 ? HIGH : LOW);
      digitalWrite(PIN_LED2, statusLampu2 ? HIGH : LOW);
      digitalWrite(PIN_LED3, statusLampu3 ? HIGH : LOW);
      digitalWrite(PIN_LED4, statusLampu4 ? HIGH : LOW);
    }
  }
  http.end();
}

// Fungsi kirim data multi sensor ke Firebase
void sendSensorTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;

  // Baca Sensor
  TempAndHumidity dhtData = dhtSensor.getTempAndHumidity();
  float suhu = isnan(dhtData.temperature) ? 27.5 : dhtData.temperature;
  float kelembaban = isnan(dhtData.humidity) ? 65.0 : dhtData.humidity;
  float jarak = readDistanceCM();
  int rawLdr = analogRead(PIN_LDR);
  // Konversi LDR ESP32 (0 - 4095) ke perkiraan Lux persentase
  float lightPercent = (1.0 - ((float)rawLdr / 4095.0)) * 100.0;
  if (lightPercent < 0) lightPercent = 0;
  bool motion = digitalRead(PIN_PIR) == HIGH;

  Serial.printf("\n[TELEMETRI] Suhu: %.1f C | Hum: %.1f %% | Jarak: %.1f cm | Cahaya: %.0f %% | Gerak: %s\n",
                suhu, kelembaban, jarak, lightPercent, motion ? "TERDETEKSI" : "AMAN");

  // Format JSON payload
  StaticJsonDocument<384> doc;
  doc["suhu"] = serialized(String(suhu, 1));
  doc["kelembaban"] = serialized(String(kelembaban, 1));
  doc["jarak"] = serialized(String(jarak, 1));
  doc["cahaya"] = round(lightPercent);
  doc["gerak"] = motion;
  doc["timestamp"] = millis();

  // Lamp status mirror
  JsonObject lamps = doc.createNestedObject("lamps");
  lamps["lampu1"] = statusLampu1;
  lamps["lampu2"] = statusLampu2;
  lamps["lampu3"] = statusLampu3;
  lamps["lampu4"] = statusLampu4;

  String jsonString;
  serializeJson(doc, jsonString);

  // HTTP PUT ke Firebase
  HTTPClient http;
  String url = FIREBASE_HOST + "/wokwi_iot/sensors.json";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(jsonString);

  if (httpCode == 200) {
    Serial.println("[FIREBASE] Telemetri sensor berhasil terkirim!");
  } else {
    Serial.printf("[FIREBASE] Gagal kirim telemetri (HTTP %d)\n", httpCode);
  }
  http.end();
}

void loop() {
  // Ambil perintah kontrol lampu setiap 500ms
  fetchLampControls();

  // Kirim data telemetri sensor sesuai interval
  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;
    sendSensorTelemetry();
  }

  delay(250);
}
