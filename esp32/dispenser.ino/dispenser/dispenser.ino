/*
  ============================================================================
  YAGUTS DISPENSER - ESP32 MAIN
  
  v0.1.4 - WiFi + Portal + API + Job Polling
  
  Arquitetura Multi-Tab:
  1. dispenser.ino (este arquivo) - WiFi, portal, heartbeat, polling
  2. job_execution.ino - Executa jobs, reporta, resume (TAB SEPARADO)
  3. job_persistence.h - Flash storage (incluído)
  4. yaguts_types.h - Tipos (incluído)
  
  ============================================================================
*/

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// Includes locais
#include "yaguts_types.h"
#include "job_persistence.h"

// ---------- Versão ----------
#define FW_VERSION           "0.1.4"

// ---------- I2C Servo Driver (PCA9685) ----------
#define SDA_PIN              21
#define SCL_PIN              22
#define I2C_SERVO_ADDR       0x40
#define SERVO_FREQ           50      // 50 Hz para servos SG90
#define SERVO_MIN_US         1000    // Posição fechada (0°)
#define SERVO_MAX_US         2000    // Posição aberta (90°)
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(I2C_SERVO_ADDR);
bool servoInitOk = false;

// ---------- API ----------
#define DEFAULT_API_HOST     "api.yaguts.com.br"
#define API_HTTPS_DEFAULT    1
#define API_PORT_HTTPS       443
#define API_PORT_HTTP        80

// TLS
#define USE_INSECURE_TLS     1      // DEV: 1. Produção: 0 + root CA
static const char *LE_ISRG_ROOT_X1 =
"-----BEGIN CERTIFICATE-----\n"
"MIIFazCCA1OgAwIBAgISA6Z5...TRUNCATED_FOR_BREVITY...\n"
"-----END CERTIFICATE-----\n";

// ---------- Debug ----------
#define DEBUG_HTTP           1

// ---------- Pinos ----------
// ANTIGO (relés): const int PIN_RES[4] = { 26, 27, 32, 33 };
// NOVO (servos via PCA9685): 4 canais (0-3)
const int SERVO_CHANNELS[4] = { 0, 1, 2, 3 };  // Canais do PCA9685 para cada frasco
const bool RELAY_ACTIVE_HIGH = true;  // DESCONTINUADO (agora usa servo)
const unsigned long MAX_STEP_MS = 180000UL;

// ---------- Timings ----------
unsigned long HEARTBEAT_EVERY_MS = 30000;
const unsigned long JOB_POLL_MS   = 1000;

// HTTP timeouts
const uint16_t HTTP_CONNECT_TIMEOUT_MS = 5000;
const uint16_t HTTP_RW_TIMEOUT_MS      = 7000;

// Reconexão
const uint8_t  POLL_RECONNECT_AFTER_FAILS = 3;

// ---------- Servidores ----------
WebServer server(80);
bool httpStarted = false;     // <<<< novo: só inicia quando houver rede
DNSServer dns;
const byte DNS_PORT = 53;
bool portalActive = false;
volatile bool portalSaved = false;

// ---------- Persistência ----------
Preferences prefs;
String st_ssid, st_pass, st_token, st_api, st_claim;

// ---------- Estado ----------
enum RunState { ST_CONFIG_PORTAL, ST_WIFI_CONNECT, ST_ONLINE };
RunState state = ST_WIFI_CONNECT;

// ---------- Job em Execução (offline-first) ----------
// Definidas em job_execution.ino (declaradas globais)
JobState g_currentJob = {0};
StaticJsonDocument<2048> g_executionLog;
unsigned long g_lastReportAttempt = 0;
const unsigned long REPORT_RETRY_INTERVAL = 30000;

// ===================================================================
// FORWARD DECLARATIONS (funções em job_execution.ino)
// ===================================================================
bool executeJobOfflineWithPersistence();
bool reportJobCompletion();
bool tryResumeJobFromFlash();
void addToExecutionLog(int ordem, int frasco, const char* tempero, 
                       float quantidade_g, float segundos, 
                       const char* status, const char* error_msg);

// ---------- Relógios ----------
unsigned long lastHeartbeat = 0;
unsigned long lastPoll = 0;

// ---------- Utils ----------
String chipUID() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[17];
  snprintf(buf, sizeof(buf), "%04X%08X", (uint16_t)(mac >> 32), (uint32_t)mac);
  return String(buf);
}
String macAddr() { return WiFi.macAddress(); }

static inline void logDiag(const char* tag) {
  Serial.printf("[%s] t=%lu WiFi=%d RSSI=%d heap=%u\n",
                tag, millis(), (int)WiFi.status(), (int)WiFi.RSSI(), (unsigned)ESP.getFreeHeap());
}

/* ---------- Modo Wi-Fi seguro ---------- */
void wifiModeSafe(wifi_mode_t mode) {
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);
  delay(200);
  WiFi.mode(mode);
  delay(200);
}

/* ---------- Início tardio do HTTP server ---------- */
void ensureHttpStarted() {
  if (!httpStarted) {
    server.begin();
    httpStarted = true;
    Serial.println("[HTTP] server iniciado");
  }
}

/* ---------- HTTP endpoints locais ---------- */
const char PAGE_INDEX[] PROGMEM = R"HTML(
<!doctype html><html lang=pt-br><meta charset=utf-8>
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
  <label>SSID</label><input name="ssid" required>
  <label>Senha</label><input name="pass" type="password">
  <label>Código de vínculo (6 dígitos, opcional)</label>
  <input name="claim" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="123456">
  <label>Servidor da API (opcional)</label>
  <input name="api" placeholder="api.yaguts.com.br ou https://api.yaguts.com.br">
  <button>Salvar e conectar</button>
</form>
<p><small id="info"></small></p>
<script>
fetch('/info').then(r=>r.json()).then(j=>{
 document.getElementById('info').textContent =
  `UID: ${j.uid} • MAC: ${j.mac} • Versão: ${j.fw} • RSSI: ${j.rssi}dBm • IP: ${j.ip}`;
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
  doc["ip"] = WiFi.localIP().toString();
  String out; serializeJson(doc, out);
  server.send(200, "application/json", out);
}

static bool isSixDigitsAllowEmpty(const String& s) {
  if (!s.length()) return true;
  if (s.length() != 6) return false;
  for (char c: s) if (c<'0'||c>'9') return false;
  return true;
}

void handleSave() {
  String ssid  = server.arg("ssid");
  String pass  = server.arg("pass");
  String claim = server.arg("claim");
  String api   = server.arg("api");
  if (!ssid.length() || !isSixDigitsAllowEmpty(claim)) {
    server.send(400, "text/plain", "Dados invalidos (SSID ou claim).");
    return;
  }
  prefs.begin("yaguts", false);
  prefs.putString("wifi_ssid", ssid);
  prefs.putString("wifi_pass", pass);
  if (claim.length()) prefs.putString("claim", claim);
  if (api.length())   prefs.putString("api_host", api);
  prefs.end();
  st_ssid = ssid; st_pass = pass;
  if (claim.length()) st_claim = claim;
  if (api.length())   st_api = api;
  portalSaved = true;
  server.send(200, "text/plain", "OK. Vou reconectar agora.");
}

void handleWipe() {
  prefs.begin("yaguts", false);
  prefs.clear();
  prefs.end();
  server.send(200, "text/plain", "Preferencias apagadas. Reiniciando...");
  delay(400);
  ESP.restart();
}

void setupHttpHandlers() {
  server.on("/", handleRoot);
  server.on("/info", handleInfo);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/wipe", handleWipe);
}

/* ---------- API helpers ---------- */
ApiEndpoint parseApi() {
  String raw = st_api.length() ? st_api : String(DEFAULT_API_HOST);
  raw.trim();
  bool https = API_HTTPS_DEFAULT;
  if (raw.startsWith("https://")) { https = true; raw.remove(0,8); }
  else if (raw.startsWith("http://")) { https = false; raw.remove(0,7); }
  int slash = raw.indexOf('/'); if (slash >= 0) raw = raw.substring(0, slash);
  uint16_t port = https ? API_PORT_HTTPS : API_PORT_HTTP;
  String host = raw;
  int col = raw.indexOf(':');
  if (col > 0) { host = raw.substring(0, col); int p = raw.substring(col+1).toInt(); if (p>0) port=(uint16_t)p; }
  host.trim(); if (!host.length()) host = DEFAULT_API_HOST;
  if (!https && port == 443) https = true;
  if (https && port == 80)   port = 443;
  return ApiEndpoint{host, port, https};
}

static void httpApplyCommon(HTTPClient& http, const String& path) {
  http.setUserAgent(String("YagutsESP32/") + FW_VERSION);
  http.addHeader("Accept", "application/json");
  http.addHeader("Connection", "close");
  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_RW_TIMEOUT_MS);
  http.setReuse(false);
  if (path.startsWith("/devices/me/") && st_token.length()) {
    http.addHeader("Authorization", String("Bearer ") + st_token);
  }
}

int httpGET(const String& path, String &out) {
  ApiEndpoint ep = parseApi();
  HTTPClient http;
#if DEBUG_HTTP
  Serial.printf("[HTTP GET] %s://%s:%u%s\n", ep.https ? "https" : "http",
                ep.host.c_str(), ep.port, path.c_str());
  logDiag("HTTP-GET/begin");
#endif
  WiFiClientSecure sclient; WiFiClient cclient; WiFiClient* client = nullptr;
  if (ep.https) {
  #if USE_INSECURE_TLS
    sclient.setInsecure();
  #else
    sclient.setCACert(LE_ISRG_ROOT_X1);
  #endif
    client = &sclient;
  } else client = &cclient;

  if (!http.begin(*client, ep.host.c_str(), ep.port, path)) { out = ""; return -1; }
  httpApplyCommon(http, path);
  int code = http.GET();
  out = http.getString();
#if DEBUG_HTTP
  Serial.printf("[HTTP GET] -> %d (len=%d)\n", code, out.length());
  logDiag("HTTP-GET/end");
#endif
  if (code <= 0) { WiFi.disconnect(true, true); delay(200); WiFi.reconnect(); }
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
  logDiag("HTTP-POST/begin");
#endif
  WiFiClientSecure sclient; WiFiClient cclient; WiFiClient* client = nullptr;
  if (ep.https) {
  #if USE_INSECURE_TLS
    sclient.setInsecure();
  #else
    sclient.setCACert(LE_ISRG_ROOT_X1);
  #endif
    client = &sclient;
  } else client = &cclient;

  if (!http.begin(*client, ep.host.c_str(), ep.port, path)) { out = ""; return -1; }
  httpApplyCommon(http, path);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(jsonBody);
  out = http.getString();
#if DEBUG_HTTP
  Serial.printf("[HTTP POST] -> %d (len=%d)\n", code, out.length());
  if (code >= 400) Serial.println(out);
  logDiag("HTTP-POST/end");
#endif
  if (code <= 0) { WiFi.disconnect(true, true); delay(200); WiFi.reconnect(); }
  http.end();
  return code;
}

/* ---------- Portal AP (liga só quando precisa) ---------- */
void startPortal() {
  if (portalActive) return;
  wifiModeSafe(WIFI_AP);
  String ssid = String("Yaguts-") + chipUID().substring(8);
  WiFi.softAP(ssid.c_str());
  delay(100);
  dns.start(DNS_PORT, "*", WiFi.softAPIP());
  portalActive = true;
  ensureHttpStarted();     // <<<< inicia HTTP agora que o AP está de pé
  state = ST_CONFIG_PORTAL;
  Serial.printf("[PORTAL] AP '%s' em %s\n", ssid.c_str(), WiFi.softAPIP().toString().c_str());
}

void stopPortal() {
  if (!portalActive) return;
  dns.stop();
  WiFi.softAPdisconnect(true);
  portalActive = false;
}

/* ---------- STA ---------- */
bool connectSTA(unsigned long timeoutMs = 20000) {
  if (!st_ssid.length()) return false;
  wifiModeSafe(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setSleep(false);
  WiFi.begin(st_ssid.c_str(), st_pass.c_str());
  Serial.printf("[WIFI] Conectando em '%s' ...\n", st_ssid.c_str());
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < timeoutMs) {
    delay(200); Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WIFI] OK. IP: %s RSSI:%d\n", WiFi.localIP().toString().c_str(), (int)WiFi.RSSI());
    ensureHttpStarted();   // <<<< inicia HTTP agora que STA está ativa
    return true;
  }
  Serial.println("[WIFI] Falha.");
  return false;
}

/* ---------- Dispositivo / backend ---------- */
static String _json_pick_token(const JsonVariantConst& root) {
  const char* keys1[] = {"device_token", "token", "access_token"};
  for (auto k : keys1) { const char* v = root[k] | nullptr; if (v && *v) return String(v); }
  const char* parents[] = {"data", "result"};
  for (auto p : parents) { JsonVariantConst sub = root[p]; if (!sub.isNull())
    for (auto k : keys1) { const char* v = sub[k] | nullptr; if (v && *v) return String(v); } }
  return "";
}
static String _scan_token_from_body(const String& body) {
  const char* keys[] = {"\"device_token\"", "\"access_token\"", "\"token\""};
  for (auto k : keys) {
    int i = body.indexOf(k); if (i < 0) continue;
    int c = body.indexOf(':', i); if (c < 0) continue;
    while (c+1 < (int)body.length() && (body[c+1]==' '||body[c+1]=='\t')) c++;
    int q1 = body.indexOf('"', c+1); if (q1 < 0) continue;
    int q2 = body.indexOf('"', q1+1); if (q2 < 0) continue; 
    String tok = body.substring(q1+1, q2);
    if (tok.length() > 10) return tok;
  }
  return "";
}

bool doClaim() {
  if (!st_claim.length()) { Serial.println("[CLAIM] Sem claim_code."); return false; }
  StaticJsonDocument<256> in;
  in["uid"] = chipUID(); in["claim_code"] = st_claim; in["fw_version"] = FW_VERSION; in["mac"] = macAddr();
  String body; serializeJson(in, body);
  String out; int code = httpPOST("/devices/claim", body, out);
  Serial.printf("[CLAIM] HTTP %d\n", code);
  if (code != 200) { Serial.println(out); return false; }
  String tok = ""; int hb = 30;
  StaticJsonDocument<2048> doc; if (!deserializeJson(doc, out)) {}
  if (!doc.isNull()) { tok = _json_pick_token(doc.as<JsonVariantConst>()); hb = doc["heartbeat_sec"] | 30; }
  if (!tok.length()) tok = _scan_token_from_body(out);
  if (!tok.length()) { Serial.println("[CLAIM] token ausente."); return false; }
  prefs.begin("yaguts", false); prefs.putString("device_token", tok); prefs.remove("claim"); prefs.end();
  prefs.begin("yaguts", true);  st_token = prefs.getString("device_token", ""); prefs.end(); st_claim = "";
  HEARTBEAT_EVERY_MS = (unsigned long)hb * 1000UL;
  Serial.printf("[CLAIM] OK token_len=%d hb=%ds\n", st_token.length(), hb);
  return st_token.length() > 0;
}

bool sendHeartbeat() {
  StaticJsonDocument<256> in;
  in["fw_version"] = FW_VERSION;
  JsonObject st = in.createNestedObject("status");
  st["rssi"] = (int)WiFi.RSSI();
  st["free_heap"] = (int)ESP.getFreeHeap();
  String body; serializeJson(in, body);
  String out; int code = httpPOST("/devices/me/heartbeat", body, out);
  Serial.printf("[HB] HTTP %d\n", code);
  if (code == 401) { prefs.begin("yaguts", false); prefs.remove("device_token"); prefs.end(); st_token = ""; }
  return code == 200;
}

bool postJobStatus(int jobId, const char* status, const char* errmsg = nullptr) {
  StaticJsonDocument<192> in;
  in["status"] = status; if (errmsg) in["error"] = errmsg;
  String body; serializeJson(in, body);
  String out; String path = String("/devices/me/jobs/") + String(jobId) + "/status";
  int code = httpPOST(path, body, out);
  Serial.printf("[JOB %d] status '%s' -> HTTP %d\n", jobId, status, code);
  return code == 200;
}

void runReservoir(int frasco, unsigned long ms) {
  if (frasco < 1 || frasco > 4 || !servoInitOk) return;
  
  int servoChannel = SERVO_CHANNELS[frasco - 1];
  
  // Abre o servo (90 graus): 2000 µs
  Serial.printf("[SERVO] Abrindo frasco %d (canal %d)...\n", frasco, servoChannel);
  pwm.writeMicroseconds(servoChannel, SERVO_MAX_US);
  delay(100);  // Pequeno atraso para servo se mover
  
  // Mantém aberto pelo tempo especificado
  unsigned long t0 = millis();
  while (millis() - t0 < ms) {
    delay(10);
  }
  
  // Fecha o servo (0 graus): 1000 µs
  Serial.printf("[SERVO] Fechando frasco %d (canal %d)\n", frasco, servoChannel);
  pwm.writeMicroseconds(servoChannel, SERVO_MIN_US);
  delay(100);  // Pequeno atraso para servo se mover
}

bool executeJob(const String& json) {
  StaticJsonDocument<4096> doc;
  if (deserializeJson(doc, json)) { Serial.println("[JOB] JSON invalido."); return false; }
  int jobId = doc["id"] | 0; if (!jobId) { Serial.println("[JOB] id ausente."); return false; }
  JsonArray itens = doc["itens"].as<JsonArray>(); if (itens.isNull()) { Serial.println("[JOB] itens ausentes."); return false; }
  postJobStatus(jobId, "running");
  for (JsonObject it : itens) {
    int frasco = it["frasco"] | 0; double segundos = it["segundos"] | 0.0;
    if (frasco < 1 || frasco > 4) { Serial.println("[JOB] frasco invalido."); return false; }
    unsigned long ms = (unsigned long)(segundos * 1000.0);
    if (ms == 0) continue; if (ms > MAX_STEP_MS) ms = MAX_STEP_MS;
    Serial.printf("[JOB %d] R%d por %.3fs\n", jobId, frasco, segundos);
    runReservoir(frasco, ms);
  }
  if (!postJobStatus(jobId, "done")) Serial.println("[JOB] Falha ao reportar 'done'.");
  delay(150); lastPoll = 0; Serial.println("[JOB] Concluido. Forcando novo poll imediato.");
  return true;
}

bool pollNextJob() {
  static int fails = 0;
  String out; int code = httpGET("/devices/me/next_job", out);
  if (code <= 0) {
    fails++; Serial.printf("[POLL] erro %d (%d fails)\n", code, fails);
    if (fails >= POLL_RECONNECT_AFTER_FAILS) {
      Serial.println("[POLL] reconectando Wi-Fi...");
      WiFi.disconnect(true, true); delay(200); WiFi.reconnect(); fails = 0;
    }
    return false;
  }
  if (code == 401) { prefs.begin("yaguts", false); prefs.remove("device_token"); prefs.end(); st_token = ""; return false; }
  if (code == 204) { Serial.println("[POLL] 204 (sem job)"); fails = 0; return false; }
  if (code == 200 && out.length() > 0) {
    fails = 0; 
    Serial.println("[POLL] ✓ Job recebido!");
    Serial.println(out);
    
    // ===== NOVO: Salvar em Flash ANTES de executar (offline-first) =====
    StaticJsonDocument<4096> doc;
    if (!deserializeJson(doc, out)) {
      g_currentJob.jobId = doc["id"] | 0;
      g_currentJob.totalItens = doc["itens"].size();
      g_currentJob.itensConcluidos = 0;
      g_currentJob.itensFalhados = 0;
      g_currentJob.timestampInicio = millis();
      
      // Salva JSON completo em string
      String jsonStr;
      serializeJson(doc, jsonStr);
      strncpy(g_currentJob.jsonPayload, jsonStr.c_str(), sizeof(g_currentJob.jsonPayload) - 1);
      g_currentJob.logPayload[0] = '\0';  // Log vazio inicialmente
      
      // Persiste em Flash
      saveJob(g_currentJob);
      Serial.printf("[POLL] Job %d salvo em Flash para execução offline\n", g_currentJob.jobId);
    }
    
    // ===== NOVO: Executar localmente (online ou offline após isto) =====
    bool execOk = executeJobOfflineWithPersistence();
    
    // ===== NOVO: Reportar ao backend (idempotência se falhar) =====
    bool reportOk = reportJobCompletion();
    
    if (!execOk || !reportOk) {
      Serial.printf("[POLL] Execução OK: %d, Report OK: %d (vai retry)\n", execOk, reportOk);
    }
    
    return true;
  }
  Serial.printf("[POLL] HTTP %d\n", code); fails = 0; return false;
}

/* ---------- Setup / Loop ---------- */
void setupPins() {
  // Inicializa I2C para servo driver
  Serial.println("[SERVO] Inicializando I2C...");
  Wire.begin(SDA_PIN, SCL_PIN);
  delay(100);
  
  // Inicializa PCA9685
  if (!pwm.begin()) {
    Serial.println("[SERVO] ✗ Falha ao inicializar PCA9685!");
    servoInitOk = false;
    return;
  }
  
  // Configura frequência do servo
  pwm.setOscillatorFrequency(25000000);  // 25 MHz (padrão PCA9685)
  pwm.setPWMFreq(SERVO_FREQ);            // 50 Hz para SG90
  delay(10);
  
  // Coloca todos os servos em posição fechada (1000 µs = 0°)
  for (int i = 0; i < 4; i++) {
    pwm.writeMicroseconds(SERVO_CHANNELS[i], SERVO_MIN_US);
  }
  
  Serial.println("[SERVO] ✓ PCA9685 inicializado com sucesso!");
  servoInitOk = true;
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
  Serial.printf("[PREFS] api_host='%s' token_len=%d claim=%s\n",
    st_api.c_str(), st_token.length(), st_claim.length()?st_claim.c_str():"(none)");
#endif
}

void setup() {
  Serial.begin(115200); delay(200);
  Serial.println("\n=== Yaguts Dispenser (ESP32) ===");
  Serial.printf("UID: %s  MAC: %s  FW: %s\n", chipUID().c_str(), macAddr().c_str(), FW_VERSION);

  setupPins();
  loadPrefs();

  // ===== NOVO: Tentar retomar job anterior (offline-first recovery) =====
  if (tryResumeJobFromFlash()) {
    Serial.println("[SETUP] Job anterior detectado, será retomado ao conectar");
  }

  // Só registra handlers aqui; NÃO inicia server ainda!
  setupHttpHandlers();

  if (!st_ssid.length()) startPortal();    // AP: inicia server dentro de startPortal()
  else state = ST_WIFI_CONNECT;            // STA: inicia server quando conectar
}

void loop() {
  if (portalActive) dns.processNextRequest();
  if (httpStarted)  server.handleClient();

  if (portalSaved) {
    portalSaved = false;
    stopPortal();
    state = ST_WIFI_CONNECT;
  }

  switch (state) {
    case ST_CONFIG_PORTAL:
      delay(10);
      break;

    case ST_WIFI_CONNECT:
      if (connectSTA()) {
        if (!st_token.length()) { if (!doClaim()) { startPortal(); break; } }
        lastHeartbeat = 0; lastPoll = 0;
        state = ST_ONLINE; Serial.println("[STATE] ONLINE");
      } else {
        startPortal();
      }
      break;

    case ST_ONLINE:
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WIFI] Caiu. Tentando reconectar...");
        state = ST_WIFI_CONNECT;
        break;
      }
      unsigned long now = millis();
      
      // ===== NOVO: Retry de report se job pendente =====
      if (g_currentJob.jobId && now - g_lastReportAttempt >= REPORT_RETRY_INTERVAL) {
        Serial.println("[LOOP] Tentando reportar job pendente...");
        reportJobCompletion();
        g_lastReportAttempt = now;
      }
      
      if (now - lastHeartbeat >= HEARTBEAT_EVERY_MS) { sendHeartbeat(); lastHeartbeat = now; }
      if (now - lastPoll >= JOB_POLL_MS)            { pollNextJob();  lastPoll = now; }
      delay(10);
      break;
  }
}

// ============================================================================
// ADICIONAR ITEM AO LOG DE EXECUÇÃO
// ============================================================================

void addToExecutionLog(int ordem, int frasco, const char* tempero, 
                       float quantidade_g, float segundos, 
                       const char* status, const char* error_msg = nullptr) {
  
  JsonObject item = g_executionLog.createNestedObject();
  item["item_ordem"] = ordem;
  item["frasco"] = frasco;
  item["tempero"] = tempero;
  item["quantidade_g"] = quantidade_g;
  item["segundos"] = segundos;
  item["status"] = status;
  
  if (error_msg) {
    item["error"] = error_msg;
  }
  
  Serial.printf("[LOG] Item %d: Frasco %d (%s) - %s\n", 
    ordem, frasco, tempero, status);
}

// ============================================================================
// EXECUTAR JOB OFFLINE (COM PERSISTÊNCIA)
// ============================================================================

bool executeJobOfflineWithPersistence() {
  
  if (!g_currentJob.jobId) {
    Serial.println("[EXEC] Nenhum job em memória");
    return false;
  }
  
  Serial.printf("[EXEC] ========== Iniciando execução do job %d ==========\n", 
    g_currentJob.jobId);
  Serial.printf("[EXEC] Resumindo de item %d/%d\n", 
    g_currentJob.itensConcluidos + 1, g_currentJob.totalItens);
  
  // Parse JSON do job completo
  StaticJsonDocument<4096> jobDoc;
  DeserializationError error = deserializeJson(jobDoc, g_currentJob.jsonPayload);
  
  if (error) {
    Serial.printf("[EXEC] ✗ JSON corrompido: %s\n", error.c_str());
    return false;
  }
  
  JsonArray itens = jobDoc["itens"].as<JsonArray>();
  if (itens.isNull() || itens.size() == 0) {
    Serial.println("[EXEC] ✗ Array 'itens' inválido ou vazio");
    return false;
  }
  
  if (itens.size() != g_currentJob.totalItens) {
    Serial.printf("[EXEC] ⚠ Mismatch: esperava %d itens, JSON tem %d\n", 
      g_currentJob.totalItens, itens.size());
  }
  
  // Clear log anterior
  g_executionLog.clear();
  
  unsigned long execStartTime = millis();
  
  // =============== LOOP DE EXECUÇÃO ===============
  for (int i = g_currentJob.itensConcluidos; i < itens.size(); i++) {
    
    JsonObject item = itens[i];
    int frasco = item["frasco"] | 0;
    float quantidade_g = item["quantidade_g"] | 0.0;
    float segundos = item["segundos"] | 0.0;
    const char* tempero = item["tempero"] | "?";
    
    // Validação
    if (frasco < 1 || frasco > 4) {
      Serial.printf("[EXEC] ✗ Item %d: frasco %d inválido\n", i + 1, frasco);
      g_currentJob.itensFalhados++;
      addToExecutionLog(i + 1, frasco, tempero, quantidade_g, segundos, 
                       "failed", "frasco inválido");
      g_currentJob.jsonPayload[0] = '\0';  // Limpa JSON
      saveJob(g_currentJob);
      continue;
    }
    
    // Se tempo é 0, pula (nada a dispensar)
    if (segundos <= 0) {
      Serial.printf("[EXEC] ⊘ Item %d: tempo %.3fs = pula\n", i + 1, segundos);
      g_currentJob.itensConcluidos++;
      addToExecutionLog(i + 1, frasco, tempero, quantidade_g, segundos, "done");
      saveJob(g_currentJob);
      continue;
    }
    
    // Limita tempo máximo
    unsigned long ms = (unsigned long)(segundos * 1000.0);
    if (ms > MAX_STEP_MS) {
      Serial.printf("[EXEC] ⚠ Item %d: tempo %.3fs → limitado para %.1fs\n", 
        i + 1, segundos, MAX_STEP_MS / 1000.0);
      ms = MAX_STEP_MS;
    }
    
    // ========== EXECUTA RELÉ ==========
    Serial.printf("[EXEC] Item %d/%d: Frasco %d por %.3fs\n", 
      i + 1, itens.size(), frasco, segundos);
    
    unsigned long itemStart = millis();
    
    // BLOQUEANTE: Ativa relé e espera
    runReservoir(frasco, ms);
    
    unsigned long itemDuration = millis() - itemStart;
    float realSeconds = itemDuration / 1000.0;
    
    // ========== SUCESSO =========
    g_currentJob.itensConcluidos++;
    addToExecutionLog(i + 1, frasco, tempero, quantidade_g, segundos, "done");
    
    // Salva progresso em Flash (recovery após crash)
    saveJob(g_currentJob);
    
    Serial.printf("[EXEC] ✓ Item %d concluído (real: %.2fs). Progresso salvo.\n", 
      i + 1, realSeconds);
  }
  // =============== FIM LOOP ===============
  
  unsigned long totalDuration = millis() - execStartTime;
  Serial.printf("[EXEC] ========== Execução concluída em %.2fs ==========\n", 
    totalDuration / 1000.0);
  Serial.printf("[EXEC] Resultado: %d OK, %d falhas\n", 
    g_currentJob.itensConcluidos, g_currentJob.itensFalhados);
  
  return true;
}

// ============================================================================
// REPORTAR CONCLUSÃO AO BACKEND
// ============================================================================

bool reportJobCompletion() {
  
  if (!g_currentJob.jobId) {
    Serial.println("[REPORT] Nenhum job para reportar");
    return false;
  }
  
  // Serializa log em JSON
  String logJson;
  serializeJson(g_executionLog, logJson);
  
  // Constrói payload para POST
  StaticJsonDocument<512> payload;
  payload["itens_completados"] = g_currentJob.itensConcluidos;
  payload["itens_falhados"] = g_currentJob.itensFalhados;
  
  // Parse log e adiciona ao payload
  StaticJsonDocument<2048> logParsed;
  if (!deserializeJson(logParsed, logJson)) {
    JsonArray logArray = logParsed.as<JsonArray>();
    payload["execution_logs"] = logArray;
  }
  
  String body;
  serializeJson(payload, body);
  
  Serial.printf("[REPORT] Enviando relatório do job %d (tentativa)\n", 
    g_currentJob.jobId);
  Serial.printf("[REPORT] Completados: %d, Falhados: %d\n", 
    g_currentJob.itensConcluidos, g_currentJob.itensFalhados);
  
  // POST /devices/me/jobs/{job_id}/complete
  String path = String("/devices/me/jobs/") + String(g_currentJob.jobId) + "/complete";
  String response;
  int code = httpPOST(path, body, response);
  
  if (code == 200) {
    Serial.println("[REPORT] ✓ Relatório enviado com sucesso!");
    Serial.printf("[REPORT] Response: %s\n", response.c_str());
    
    // Limpa job da Flash (foi processado)
    clearJob();
    g_executionLog.clear();
    g_currentJob.jobId = 0;
    
    return true;
  }
  
  Serial.printf("[REPORT] ✗ Falha ao reportar: HTTP %d\n", code);
  Serial.printf("[REPORT] Mantendo job em Flash para retry posterior\n");
  
  return false;
}

// ============================================================================
// TENTAR RETOMAR JOB ANTERIOR (APÓS CRASH/REBOOT)
// ============================================================================

bool tryResumeJobFromFlash() {
  
  if (!hasJobInFlash()) {
    return false;
  }
  
  Serial.println("[RESUME] ⚡ Job pendente detectado em Flash!");
  
  JobState resumedJob = {0};
  if (!loadJob(resumedJob)) {
    return false;
  }
  
  // Restaura em memória
  g_currentJob = resumedJob;
  
  // Parse log anterior se houver
  if (resumedJob.logPayload[0] != '\0') {
    deserializeJson(g_executionLog, resumedJob.logPayload);
  }
  
  Serial.printf("[RESUME] Retomando job %d (item %d/%d)\n", 
    g_currentJob.jobId, 
    g_currentJob.itensConcluidos + 1, 
    g_currentJob.totalItens);
  
  return true;
}
