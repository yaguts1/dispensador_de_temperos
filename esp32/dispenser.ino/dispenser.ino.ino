/*
  Yaguts Dispenser — ESP32 Base (v0.1.4)
  - Portal cativo para SSID/senha/claim/API.
  - Claim: POST /devices/claim → device_token.
  - Online: heartbeat + polling de jobs.

  Correções principais:
    • Cliente TLS/HTTP mantido vivo durante toda a chamada (evita “The plain HTTP request was sent to HTTPS port”).
    • parseApi() robusto: remove paths, ajusta coerência http/https ↔ portas.
    • Persistência do token: grava, re-lê e confirma; limpa se backend responder 401.
    • Parser do claim mais flexível (device_token / token / access_token, inclusive em data.* / result.*), com fallback por string scanning.
    • /wipe para zerar preferências.
    • Logs melhores (inclui 204 no poll) + **poll imediato após concluir job**.

  Dica: deixe o campo “Servidor da API” como:  api.yaguts.com.br
*/

#include <Arduino.h>
#include "yaguts_types.h"   // struct ApiEndpoint

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_system.h>

#define FW_VERSION           "0.1.4"
#define DEFAULT_API_HOST     "api.yaguts.com.br"
#define API_HTTPS_DEFAULT    1
#define API_PORT_HTTPS       443
#define API_PORT_HTTP        80
#define USE_INSECURE_TLS     1      // DEV: 1. Produção: 0 + root CA
#define DEBUG_HTTP           1

// (Opcional) CA da Let's Encrypt (ISRG Root X1) — usado se USE_INSECURE_TLS = 0
static const char *LE_ISRG_ROOT_X1 =
"-----BEGIN CERTIFICATE-----\n"
"MIIFazCCA1OgAwIBAgISA6Z5...TRUNCATED_FOR_BREVITY...\n"
"-----END CERTIFICATE-----\n";

// ---------- Pinos ----------
const int PIN_RES[4] = { 26, 27, 32, 33 };
const bool RELAY_ACTIVE_HIGH = true;
const unsigned long MAX_STEP_MS = 180000UL;

// ---------- Timings ----------
unsigned long HEARTBEAT_EVERY_MS = 30000;
// mais responsivo:
const unsigned long JOB_POLL_MS = 1000;

// ---------- Portal ----------
WebServer server(80);
DNSServer dns;
const byte DNS_PORT = 53;
bool portalActive = false;
volatile bool portalSaved = false;

// ---------- Persistência ----------
Preferences prefs;
String st_ssid, st_pass, st_token, st_api;
String st_claim;

// ---------- Estado ----------
enum RunState { ST_CONFIG_PORTAL, ST_WIFI_CONNECT, ST_ONLINE };
RunState state = ST_WIFI_CONNECT;

// ---------- Relógios de loop ----------
unsigned long lastHeartbeat = 0;
unsigned long lastPoll = 0;

// ---- Protótipos necessários ----
bool connectSTA(unsigned long timeoutMs = 20000);

// ---------- Aux ----------
String chipUID() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[17];
  snprintf(buf, sizeof(buf), "%04X%08X", (uint16_t)(mac >> 32), (uint32_t)mac);
  return String(buf);
}
String macAddr() { return WiFi.macAddress(); }

// ==== parseApi: normaliza host/porta/protocolo ====
ApiEndpoint parseApi() {
  String raw = st_api.length() ? st_api : String(DEFAULT_API_HOST);
  raw.trim();

  bool https = API_HTTPS_DEFAULT;
  if (raw.startsWith("https://")) { https = true; raw = raw.substring(8); }
  else if (raw.startsWith("http://")) { https = false; raw = raw.substring(7); }

  int slash = raw.indexOf('/');
  if (slash >= 0) raw = raw.substring(0, slash);

  uint16_t port = https ? API_PORT_HTTPS : API_PORT_HTTP;
  String host = raw;
  int col = raw.indexOf(':');
  if (col > 0) {
    host = raw.substring(0, col);
    int p = raw.substring(col + 1).toInt();
    if (p > 0) port = (uint16_t)p;
  }
  host.trim();
  if (!host.length()) host = DEFAULT_API_HOST;

  if (!https && port == 443) https = true;
  if (https && port == 80)   port = 443;

  return ApiEndpoint{host, port, https};
}

String maskToken(const String& tok) {
  if (tok.length() <= 10) return tok;
  return tok.substring(0, 8) + "…" + tok.substring(tok.length()-6);
}

// ---------- HTTP helpers ----------
int httpGET(const String& path, String &out) {
  ApiEndpoint ep = parseApi();
  HTTPClient http;

#if DEBUG_HTTP
  Serial.printf("[HTTP GET] %s://%s:%u%s\n", ep.https ? "https" : "http",
                ep.host.c_str(), ep.port, path.c_str());
#endif

  WiFiClientSecure sclient;
  WiFiClient       cclient;
  WiFiClient*      client = nullptr;

  if (ep.https) {
  #if USE_INSECURE_TLS
    sclient.setInsecure();
  #else
    sclient.setCACert(LE_ISRG_ROOT_X1);
  #endif
    client = &sclient;
  } else {
    client = &cclient;
  }

  if (!http.begin(*client, ep.host.c_str(), ep.port, path)) { out = ""; return -1; }

  http.setUserAgent(String("YagutsESP32/") + FW_VERSION);
  http.addHeader("Accept", "application/json");
  if (path.startsWith("/devices/me/") && st_token.length()) {
    http.addHeader("Authorization", String("Bearer ") + st_token);
  }

  int code = http.GET();
  out = http.getString();
#if DEBUG_HTTP
  Serial.printf("[HTTP GET] -> %d (len=%d)\n", code, out.length());
#endif
  http.end();
  return code;
}

int httpPOST(const String& path, const String &jsonBody, String &out) {
  ApiEndpoint ep = parseApi();
  HTTPClient http;

#if DEBUG_HTTP
  Serial.printf("[HTTP POST] %s://%s:%u%s\n", ep.https ? "https" : "http",
                ep.host.c_str(), ep.port, path.c_str());
  Serial.printf("[HTTP POST] Body: %s\n", jsonBody.c_str());
#endif

  WiFiClientSecure sclient;
  WiFiClient       cclient;
  WiFiClient*      client = nullptr;

  if (ep.https) {
  #if USE_INSECURE_TLS
    sclient.setInsecure();
  #else
    sclient.setCACert(LE_ISRG_ROOT_X1);
  #endif
    client = &sclient;
  } else {
    client = &cclient;
  }

  if (!http.begin(*client, ep.host.c_str(), ep.port, path)) { out = ""; return -1; }

  http.setUserAgent(String("YagutsESP32/") + FW_VERSION);
  http.addHeader("Accept", "application/json");
  http.addHeader("Content-Type", "application/json");
  if (path.startsWith("/devices/me/") && st_token.length()) {
    http.addHeader("Authorization", String("Bearer ") + st_token);
  }

  int code = http.POST(jsonBody);
  out = http.getString();
#if DEBUG_HTTP
  Serial.printf("[HTTP POST] -> %d (len=%d)\n", code, out.length());
  if (code >= 400) Serial.println(out);
#endif
  http.end();
  return code;
}

// ---------- Portal ----------
const char PAGE_INDEX[] PROGMEM = R"HTML(
<!doctype html>
<html lang="pt-br"><meta charset="utf-8">
<title>Yaguts • Configurar Wi-Fi</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu;max-width:520px;margin:24px auto;padding:0 14px;background:#0b1021;color:#e8ecff}
.card{background:#141c3a;padding:16px;border-radius:14px;box-shadow:0 10px 30px #0004}
h1{font-size:1.3rem;margin:.2rem 0 1rem}
label{display:block;margin:.8rem 0 .3rem}
input{width:100%;padding:10px;border-radius:10px;border:1px solid #31407a;background:#0f1733;color:#fff}
button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:10px;background:#59f;color:#08122b;font-weight:700}
small{opacity:.8}
</style>
<div class=card>
<h1>Configurar Wi-Fi do ESP32</h1>
<form method="POST" action="/save">
  <label>SSID (nome da rede)</label>
  <input name="ssid" placeholder="MinhaRede" required>
  <label>Senha da rede</label>
  <input name="pass" type="password" placeholder="********">
  <label>Código de vínculo (6 dígitos)</label>
  <input name="claim" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" required>
  <label>Servidor da API (opcional)</label>
  <input name="api" placeholder="api.yaguts.com.br ou https://api.yaguts.com.br">
  <button type="submit">Salvar e conectar</button>
</form>
<p><small>Após salvar, o dispositivo tentará se conectar à rede e se registrar no seu usuário.</small></p>
<hr>
<p><small id="info"></small></p>
<script>
fetch('/info').then(r=>r.json()).then(j=>{
 document.getElementById('info').textContent =
  `UID: ${j.uid} • MAC: ${j.mac} • Versão: ${j.fw} • Sinal(AP): ${j.rssi}dBm`;
});
</script>
</div>
)HTML";

void handleRoot() { server.send(200, "text/html; charset=utf-8", FPSTR(PAGE_INDEX)); }

void handleInfo() {
  StaticJsonDocument<256> doc;
  doc["uid"] = chipUID();
  doc["mac"] = macAddr();
  doc["fw"]  = FW_VERSION;
  doc["rssi"] = (int)WiFi.RSSI();
  String out; serializeJson(doc, out);
  server.send(200, "application/json", out);
}

static bool isSixDigits(const String& s) {
  if (s.length() != 6) return false;
  for (size_t i=0;i<6;i++) if (s[i] < '0' || s[i] > '9') return false;
  return true;
}

void handleSave() {
  String ssid = server.arg("ssid");
  String pass = server.arg("pass");
  String claim = server.arg("claim");
  String api   = server.arg("api");

  if (ssid.length() == 0 || !isSixDigits(claim)) {
    server.send(400, "text/plain", "Dados invalidos: verifique SSID e codigo (6 digitos).");
    return;
  }

  prefs.begin("yaguts", false);
  prefs.putString("wifi_ssid", ssid);
  prefs.putString("wifi_pass", pass);
  prefs.putString("claim", claim);
  if (api.length()) prefs.putString("api_host", api);
  prefs.end();

  st_ssid = ssid;
  st_pass = pass;
  st_claim = claim;
  if (api.length()) st_api = api;

  portalSaved = true;
  server.send(200, "text/plain", "OK. Vou tentar conectar na rede agora. Voce pode fechar esta pagina.");
}

// Rota utilitária para zerar preferências rapidamente
void handleWipe() {
  prefs.begin("yaguts", false);
  prefs.clear();
  prefs.end();
  server.send(200, "text/plain", "Preferencias apagadas. Reiniciando...");
  delay(400);
  ESP.restart();
}

void startPortal() {
  if (portalActive) return;
  WiFi.mode(WIFI_AP);
  String ssid = String("Yaguts-") + chipUID().substring(8);
  WiFi.softAP(ssid.c_str());

  delay(100);
  dns.start(DNS_PORT, "*", WiFi.softAPIP());
  server.on("/", handleRoot);
  server.on("/info", handleInfo);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/wipe", handleWipe);
  server.begin();
  portalActive = true;
  state = ST_CONFIG_PORTAL;
  Serial.printf("[PORTAL] AP '%s' em %s\n", ssid.c_str(), WiFi.softAPIP().toString().c_str());
}

void stopPortal() {
  if (!portalActive) return;
  dns.stop();
  server.stop();
  WiFi.softAPdisconnect(true);
  portalActive = false;
}

// ---------- Wi-Fi ----------
bool connectSTA(unsigned long timeoutMs) {
  if (!st_ssid.length()) return false;
  WiFi.mode(WIFI_STA);
  WiFi.begin(st_ssid.c_str(), st_pass.c_str());
  Serial.printf("[WIFI] Conectando em '%s' ...\n", st_ssid.c_str());
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < timeoutMs) {
    delay(200);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WIFI] OK. IP: %s RSSI:%d\n", WiFi.localIP().toString().c_str(), (int)WiFi.RSSI());
    return true;
  }
  Serial.println("[WIFI] Falha.");
  return false;
}

// ---------- helpers de parsing ----------
static String _json_pick_token(const JsonVariantConst& root) {
  const char* keys1[] = {"device_token", "token", "access_token"};
  for (auto k : keys1) {
    const char* v = root[k] | nullptr;
    if (v && *v) return String(v);
  }
  const char* parents[] = {"data", "result"};
  for (auto p : parents) {
    JsonVariantConst sub = root[p];
    if (!sub.isNull()) {
      for (auto k : keys1) {
        const char* v = sub[k] | nullptr;
        if (v && *v) return String(v);
      }
    }
  }
  return "";
}

static String _scan_token_from_body(const String& body) {
  const char* keys[] = {"\"device_token\"", "\"access_token\"", "\"token\""};
  for (auto k : keys) {
    int i = body.indexOf(k);
    if (i < 0) continue;
    int c = body.indexOf(':', i);
    if (c < 0) continue;
    while (c + 1 < (int)body.length() && (body[c+1] == ' ' || body[c+1] == '\t')) c++;
    int q1 = body.indexOf('"', c + 1);
    if (q1 < 0) continue;
    int q2 = body.indexOf('"', q1 + 1);
    if (q2 < 0) continue;
    String tok = body.substring(q1 + 1, q2);
    if (tok.length() > 10) return tok;
  }
  return "";
}

// ---------- Dispositivo ----------
bool doClaim() {
  if (!st_claim.length()) {
    Serial.println("[CLAIM] Sem claim_code. Abra o portal para vincular.");
    return false;
  }
  StaticJsonDocument<256> in;
  in["uid"] = chipUID();
  in["claim_code"] = st_claim;
  in["fw_version"] = FW_VERSION;
  in["mac"] = macAddr();
  String body; serializeJson(in, body);

  String out;
  int code = httpPOST("/devices/claim", body, out);
  Serial.printf("[CLAIM] HTTP %d\n", code);
  if (code != 200) { Serial.println(out); return false; }

  String tok = "";
  int hb = 30;
  {
    StaticJsonDocument<2048> doc;
    DeserializationError e = deserializeJson(doc, out);
    if (!e) {
      tok = _json_pick_token(doc.as<JsonVariantConst>());
      hb  = doc["heartbeat_sec"] | 30;
    }
  }
  if (!tok.length()) tok = _scan_token_from_body(out);

  if (!tok.length()) {
    Serial.print("[CLAIM] token ausente. Body: ");
    if (out.length() > 300) Serial.println(out.substring(0, 300) + "...");
    else Serial.println(out);
    return false;
  }

  prefs.begin("yaguts", false);
  prefs.putString("device_token", tok);
  prefs.remove("claim");
  prefs.end();

  prefs.begin("yaguts", true);
  st_token = prefs.getString("device_token", "");
  prefs.end();
  st_claim = "";

  HEARTBEAT_EVERY_MS = (unsigned long)hb * 1000UL;
  Serial.printf("[CLAIM] VINCULO OK. token_len=%d heartbeat=%ds\n",
                st_token.length(), hb);
  return st_token.length() > 0;
}

bool sendHeartbeat() {
  StaticJsonDocument<256> in;
  in["fw_version"] = FW_VERSION;
  JsonObject st = in.createNestedObject("status");
  st["rssi"] = (int)WiFi.RSSI();
  st["free_heap"] = (int)ESP.getFreeHeap();
  String body; serializeJson(in, body);
  String out;
  int code = httpPOST("/devices/me/heartbeat", body, out);
  Serial.printf("[HB] HTTP %d\n", code);

  if (code == 401) {
    Serial.println("[HB] Token invalido. Limpando NVS para novo claim.");
    prefs.begin("yaguts", false);
    prefs.remove("device_token");
    prefs.end();
    st_token = "";
  }
  return code == 200;
}

bool postJobStatus(int jobId, const char* status, const char* errmsg = nullptr) {
  StaticJsonDocument<192> in;
  in["status"] = status;
  if (errmsg) in["error"] = errmsg;
  String body; serializeJson(in, body);
  String out;
  String path = String("/devices/me/jobs/") + String(jobId) + "/status";
  int code = httpPOST(path, body, out);
  Serial.printf("[JOB %d] status '%s' -> HTTP %d\n", jobId, status, code);
  return code == 200;
}

void runReservoir(int frasco, unsigned long ms) {
  if (frasco < 1 || frasco > 4) return;
  int pin = PIN_RES[frasco - 1];
  digitalWrite(pin, RELAY_ACTIVE_HIGH ? HIGH : LOW);
  unsigned long t0 = millis();
  while (millis() - t0 < ms) { delay(10); }
  digitalWrite(pin, RELAY_ACTIVE_HIGH ? LOW : HIGH);
}

bool executeJob(const String& json) {
  StaticJsonDocument<4096> doc;
  DeserializationError e = deserializeJson(doc, json);
  if (e) { Serial.println("[JOB] JSON invalido."); return false; }
  int jobId = doc["id"] | 0;
  if (!jobId) { Serial.println("[JOB] id ausente."); return false; }
  JsonArray itens = doc["itens"].as<JsonArray>();
  if (itens.isNull()) { Serial.println("[JOB] itens ausentes."); return false; }

  postJobStatus(jobId, "running");
  for (JsonObject it : itens) {
    int frasco = it["frasco"] | 0;
    double segundos = it["segundos"] | 0.0;
    if (frasco < 1 || frasco > 4) { Serial.println("[JOB] frasco invalido."); return false; }
    unsigned long ms = (unsigned long)(segundos * 1000.0);
    if (ms == 0) continue;
    if (ms > MAX_STEP_MS) ms = MAX_STEP_MS;
    Serial.printf("[JOB %d] R%d por %.3fs\n", jobId, frasco, segundos);
    runReservoir(frasco, ms);
  }
  if (!postJobStatus(jobId, "done")) Serial.println("[JOB] Falha ao reportar 'done'.");

  // >>> NOVO: força um poll imediato após concluir
  lastPoll = 0;
  Serial.println("[JOB] Concluido. Forcando novo poll imediato.");
  return true;
}

bool pollNextJob() {
  String out;
  int code = httpGET("/devices/me/next_job", out);

  if (code == 401) {
    Serial.println("[POLL] 401 — token invalido. Limpando NVS para novo claim.");
    prefs.begin("yaguts", false);
    prefs.remove("device_token");
    prefs.end();
    st_token = "";
    return false;
  }

  if (code == 204) {
    Serial.println("[POLL] HTTP 204 (sem job)");
    return false;
  }

  if (code == 200 && out.length() > 0) {
    Serial.println("[JOB] Recebido:");
    Serial.println(out);
    bool ok = executeJob(out);
    if (!ok) {
      StaticJsonDocument<512> d; if (!deserializeJson(d, out)) {
        int jid = d["id"] | 0;
        if (jid) postJobStatus(jid, "error", "execucao falhou");
      }
    }
    return true;
  }

  Serial.printf("[POLL] HTTP %d\n", code);
  return false;
}

// ---------- Setup / Loop ----------
void setupPins() {
  for (int i = 0; i < 4; i++) {
    pinMode(PIN_RES[i], OUTPUT);
    digitalWrite(PIN_RES[i], RELAY_ACTIVE_HIGH ? LOW : HIGH);
  }
}

void loadPrefs() {
  prefs.begin("yaguts", true);
  st_ssid  = prefs.getString("wifi_ssid", "");
  st_pass  = prefs.getString("wifi_pass", "");
  st_token = prefs.getString("device_token", "");
  st_api   = prefs.getString("api_host", DEFAULT_API_HOST);
  st_claim = prefs.getString("claim", "");
  prefs.end();

#if DEBUG_HTTP
  Serial.printf("[PREFS] api_host='%s'  token_len=%d  claim=%s\n",
                st_api.c_str(),
                st_token.length(),
                st_claim.length() ? st_claim.c_str() : "(none)");
#endif
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== Yaguts Dispenser (ESP32) ===");
  Serial.printf("UID: %s  MAC: %s  FW: %s\n", chipUID().c_str(), macAddr().c_str(), FW_VERSION);

  setupPins();
  loadPrefs();

  if (!st_ssid.length()) startPortal();
  else state = ST_WIFI_CONNECT;
}

void loop() {
  if (portalActive) {
    dns.processNextRequest();
    server.handleClient();
    if (portalSaved) { portalSaved = false; stopPortal(); state = ST_WIFI_CONNECT; }
    return;
  }

  switch (state) {
    case ST_WIFI_CONNECT: {
      if (connectSTA()) {
        if (!st_token.length()) { if (!doClaim()) { startPortal(); return; } }
        lastHeartbeat = 0; lastPoll = 0;
        state = ST_ONLINE; Serial.println("[STATE] ONLINE");
      } else { startPortal(); }
    } break;

    case ST_ONLINE: {
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WIFI] Caiu. Tentando reconectar...");
        state = ST_WIFI_CONNECT;
        break;
      }
      unsigned long now = millis();
      if (now - lastHeartbeat >= HEARTBEAT_EVERY_MS) { sendHeartbeat(); lastHeartbeat = now; }
      if (now - lastPoll >= JOB_POLL_MS)            { pollNextJob();  lastPoll = now; }
      delay(10);
    } break;

    default: delay(10); break;
  }
}
