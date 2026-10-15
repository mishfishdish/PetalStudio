#if defined(ESP8266)
  #include <ESP8266WiFi.h>
#elif defined(ESP32)
  #include <WiFi.h>
#else
  #error "This sketch supports ESP32 and ESP8266 boards."
#endif

#include <WebSocketsClient.h>
#include "secrets.h"

constexpr uint8_t RELAY_PIN = 26;
constexpr uint8_t RELAY_ACTIVE = LOW;
constexpr uint8_t RELAY_IDLE = HIGH;
constexpr unsigned long RELAY_PULSE_MS = 500;

WebSocketsClient webSocket;
String lastCommandId;

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
  Serial.println("Command received — pulsing garage relay");
  digitalWrite(RELAY_PIN, RELAY_ACTIVE);
  delay(RELAY_PULSE_MS);
  digitalWrite(RELAY_PIN, RELAY_IDLE);
}

String jsonStringValue(const String& json, const String& field) {
  const String marker = String("\"") + field + "\":\"";
  const int start = json.indexOf(marker);
  if (start < 0) return "";
  const int valueStart = start + marker.length();
  const int valueEnd = json.indexOf('"', valueStart);
  return valueEnd > valueStart ? json.substring(valueStart, valueEnd) : "";
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      Serial.println("WebSocket connected — authenticating");
      const String auth = String("{\"type\":\"auth\",\"role\":\"controller\",\"key\":\"")
        + GARAGE_API_KEY + "\"}";
      webSocket.sendTXT(auth);
      break;
    }
    case WStype_TEXT: {
      const String message = String(reinterpret_cast<char*>(payload), length);
      const String typeValue = jsonStringValue(message, "type");
      if (typeValue == "ready") {
        Serial.println("WebSocket authenticated and ready");
        break;
      }
      const String action = jsonStringValue(message, "action");
      const String commandId = jsonStringValue(message, "id");
      if (typeValue != "command" || action != "pulse" || commandId.length() == 0 || commandId == lastCommandId) break;
      lastCommandId = commandId;
      pulseRelay();
      webSocket.sendTXT(String("{\"type\":\"ack\",\"id\":\"") + commandId + "\"}");
      break;
    }
    case WStype_DISCONNECTED:
      Serial.println("WebSocket disconnected — reconnecting");
      break;
    case WStype_ERROR:
      Serial.println("WebSocket error");
      break;
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_IDLE);
  connectWifi();

  webSocket.beginSSL(WEBSOCKET_HOST, WEBSOCKET_PORT, WEBSOCKET_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(2000);
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void loop() {
  connectWifi();
  webSocket.loop();
  delay(5);
}
