#if defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <WiFiClientSecureBearSSL.h>
  using SecureClient = BearSSL::WiFiClientSecure;
#elif defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <WiFiClientSecure.h>
  using SecureClient = WiFiClientSecure;
#else
  #error "This sketch supports ESP32 and ESP8266 boards."
#endif

#include "secrets.h"

// Wire a dry-contact, opto-isolated relay across the garage wall-button terminals.
// Most relay modules are active LOW. Change these values if yours is active HIGH.
constexpr uint8_t RELAY_PIN = 5;
constexpr uint8_t RELAY_ACTIVE = LOW;
constexpr uint8_t RELAY_IDLE = HIGH;
constexpr unsigned long RELAY_PULSE_MS = 500;
constexpr unsigned long POLL_INTERVAL_MS = 2000;

SecureClient secureClient;
unsigned long lastPoll = 0;

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("Connecting to Wi-Fi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }
  Serial.print("\nConnected. IP: ");
  Serial.println(WiFi.localIP());
}

void pulseRelay() {
  Serial.println("Pulsing garage relay");
  digitalWrite(RELAY_PIN, RELAY_ACTIVE);
  delay(RELAY_PULSE_MS);
  digitalWrite(RELAY_PIN, RELAY_IDLE);
}

bool postAcknowledgement(const String& commandId) {
  HTTPClient http;
  http.setConnectTimeout(15000);
  http.setTimeout(20000);
  const String url = String("https://") + NETLIFY_HOST + "/api/garage";
  if (!http.begin(secureClient, url)) return false;
  http.addHeader("Authorization", String("Bearer ") + GARAGE_API_KEY);
  http.addHeader("Content-Type", "application/json");
  const int status = http.POST(String("{\"ack\":\"") + commandId + "\"}");
  http.end();
  return status >= 200 && status < 300;
}

void pollForCommand() {
  HTTPClient http;
  http.setConnectTimeout(15000);
  http.setTimeout(20000);
  const String url = String("https://") + NETLIFY_HOST + "/api/garage?device=1";
  if (!http.begin(secureClient, url)) return;
  http.addHeader("Authorization", String("Bearer ") + GARAGE_API_KEY);

  const int status = http.GET();
  if (status == 200) {
    const String response = http.getString();
    const int idStart = response.indexOf("\"id\":\"") + 6;
    const int idEnd = response.indexOf('"', idStart);
    const String commandId = idStart >= 6 && idEnd > idStart
      ? response.substring(idStart, idEnd)
      : "";
    http.end();

    if (commandId.length() > 0) {
      pulseRelay();
      if (!postAcknowledgement(commandId)) {
        Serial.println("Warning: relay pulsed, but acknowledgement failed");
      }
    }
    return;
  }

  if (status != 204) {
    Serial.printf(
      "Poll failed: %s (%d)\n",
      HTTPClient::errorToString(status).c_str(),
      status
    );
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_IDLE); // fail-safe: relay off before Wi-Fi starts
  connectWifi();

  // HTTPS is encrypted, but this starter configuration does not validate the
  // server certificate. See README.md before using this outside a prototype.
  secureClient.setInsecure();
}

void loop() {
  connectWifi();
  if (millis() - lastPoll >= POLL_INTERVAL_MS) {
    lastPoll = millis();
    pollForCommand();
  }
  delay(20);
}
