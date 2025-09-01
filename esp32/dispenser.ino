#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "SUA_REDE_WIFI";
const char* password = "SENHA_WIFI";

String serverName = "http://SEU_IP_LOCAL:8000/executar";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Conectando ao WiFi...");
  }
  Serial.println("Conectado!");
}

void loop() {
  if(WiFi.status() == WL_CONNECTED){
    HTTPClient http;
    http.begin(serverName);
    http.addHeader("Content-Type", "application/json");

    String json = "{\"frasco\":1,\"quantidade\":2.5}";
    int httpResponseCode = http.POST(json);

    if(httpResponseCode>0){
      String response = http.getString();
      Serial.println(httpResponseCode);
      Serial.println(response);
    }
    http.end();
  }
  delay(10000); // envia a cada 10 segundos
}
