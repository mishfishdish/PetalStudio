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
constexpr unsigned long PHOENIX_HEARTBEAT_MS = 20000;

WebSocketsClient webSocket;
String lastCommandId;
String realtimeTopic;
unsigned long lastHeartbeat = 0;
unsigned long messageRef = 1;
bool channelJoined = false;

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
  Serial.println("Realtime command received — pulsing garage relay");
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

void joinRealtimeChannel() {
  const String join = String("{\"topic\":\"") + realtimeTopic
    + "\",\"event\":\"phx_join\",\"payload\":{\"config\":{"
      "\"broadcast\":{\"ack\":false,\"self\":false},"
      "\"presence\":{\"enabled\":false},"
      "\"postgres_changes\":[],\"private\":false}},"
      "\"ref\":\"1\",\"join_ref\":\"1\"}";
  webSocket.sendTXT(join);
}

void sendPhoenixHeartbeat() {
  const String ref = String(++messageRef);
  webSocket.sendTXT(String("{\"topic\":\"phoenix\",\"event\":\"heartbeat\",\"payload\":{},\"ref\":\"") + ref + "\"}");
  lastHeartbeat = millis();
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("Supabase WebSocket connected — joining garage channel");
      channelJoined = false;
      joinRealtimeChannel();
      break;

    case WStype_TEXT: {
      const String message = String(reinterpret_cast<char*>(payload), length);
      const String event = jsonStringValue(message, "event");

      if (event == "phx_reply" && message.indexOf("\"status\":\"ok\"") >= 0) {
        if (!channelJoined) Serial.println("Supabase Realtime channel ready");
        channelJoined = true;
        break;
      }

      if (event != "broadcast" || message.indexOf("\"event\":\"pulse\"") < 0) break;
      const String action = jsonStringValue(message, "action");
      const String commandId = jsonStringValue(message, "id");
      if (action != "pulse" || commandId.length() == 0 || commandId == lastCommandId) break;

      lastCommandId = commandId;
      pulseRelay();
      break;
    }

    case WStype_DISCONNECTED:
      channelJoined = false;
      Serial.println("Supabase WebSocket disconnected — reconnecting");
      break;
    case WStype_ERROR:
      Serial.println("Supabase WebSocket error");
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

  realtimeTopic = String("realtime:") + SUPABASE_CHANNEL;
  const String socketPath = String("/realtime/v1/websocket?apikey=")
    + SUPABASE_PUBLISHABLE_KEY + "&vsn=1.0.0";

  webSocket.beginSSL(SUPABASE_HOST, 443, socketPath.c_str());
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(2000);
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void loop() {
  connectWifi();
  webSocket.loop();
  if (channelJoined && millis() - lastHeartbeat >= PHOENIX_HEARTBEAT_MS) {
    sendPhoenixHeartbeat();
  }
  delay(5);
}
