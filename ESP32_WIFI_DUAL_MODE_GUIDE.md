# ESP32 WiFi Dual Mode - Guia Prático

## 🎯 O que mudou?

Antes: ESP32 precisava de **reset físico** para re-parear  
Agora: ESP32 pode ser re-pareado **online** via hotspot 📱

---

## 🚀 Como Usar

### 1. ESP32 Parado (Sem WiFi Configurado)

```
Estado: ST_CONFIG_PORTAL
✓ Hotspot: Yaguts-XXXXX ativo
✗ Yaguts: não conectado
```

**Ação do usuário:**
```bash
# Conecta ao hotspot
WiFi SSID: Yaguts-XXXXX
Senha: yaguts123

# Acessa página de config
http://192.168.4.1

# Preenche WiFi Yaguts + code
Preencher: SSID, Senha, Code (opcional)
Clicar: "Salvar e conectar"
```

**O que acontece:**
```
1. ESP32 salva credenciais em Flash
2. Tenta conectar ao WiFi Yaguts
3. Se ✓ → ST_ONLINE (ambos AP + STA ativos)
4. Se ✗ → Permanece em ST_CONFIG_PORTAL (AP ativo)
```

---

### 2. ESP32 Operando Normal (Online)

```
Estado: ST_ONLINE
✓ Hotspot: Yaguts-XXXXX ativo
✓ Yaguts: 192.168.1.100 conectado
```

**O que está acontecendo:**
```
• Executa jobs via servidor Yaguts
• Hostbeat enviado a cada 30s
• Job polling a cada 1s
• Hotspot disponível 24/7 para reconfiguração
```

**Monitor via hotspot:**
```bash
# Acessa hotspot mesmo durante operação
curl http://192.168.4.1/connectivity-status
```

**Resposta esperada:**
```json
{
  "ap_active": true,
  "sta_connected": true,
  "ap_ip": "192.168.4.1",
  "sta_ip": "192.168.1.100",
  "rssi": -45,
  "ap_ssid": "Yaguts-A1B2C3D4"
}
```

---

### 3. WiFi Yaguts Cai (Fallback Automático)

```
Cenário: WiFi do servidor Yaguts desliga
```

**Cronograma:**
```
T+0s   ❌ WiFi desconecta
T+0s   🔄 Loop detecta
T+1s   🔄 Tenta reconectar (1ª tentativa)
T+5s   🔄 Tenta reconectar (2ª tentativa)
T+10s  🔄 Tenta reconectar (3ª tentativa)
T+15s  ⚠️  Desiste, permanece em ST_WIFI_CONNECT
       ✓ Hotspot AINDA ATIVO

T+30s  🔄 Nova tentativa automática
```

**Monitor:**
```bash
# Durante fallback
curl http://192.168.4.1/connectivity-status
```

**Resposta esperada:**
```json
{
  "ap_active": true,
  "sta_connected": false,      // ← Perdeu Yaguts
  "ap_ip": "192.168.4.1",      // ← Mas AP ativo!
  "sta_ip": "0.0.0.0",
  "rssi": 0,
  "ap_ssid": "Yaguts-A1B2C3D4"
}
```

**O que o usuário faz:**
```
1. Espera WiFi Yaguts voltar OU
2. Conecta ao hotspot e muda config via http://192.168.4.1
```

---

### 4. Re-pareamento Online (Novo!)

```
Cenário: Trocar de WiFi ou atualizar código de pareamento
```

**Passo a passo:**
```
1. ESP32 está operando normalmente
   ✓ Online (jobs executando)
   ✓ Hotspot ativo

2. Usuário conecta ao hotspot
   SSID: Yaguts-XXXXX
   Senha: yaguts123

3. Acessa http://192.168.4.1
   [Página de config carrega]

4. Preenche novo WiFi + novo code:
   SSID:  WiFi-Novo
   Senha: senha123
   Code:  654321

5. Clica "Salvar e conectar"
   [Página exibe "OK. Vou reconectar agora"]

6. ESP32 salva em Flash e:
   - Mantém AP ativo
   - Desconecta de WiFi-Antigo
   - Tenta conectar a WiFi-Novo
   - Envia novo code de pareamento

7. Resultado:
   ✓ Se conectou → ST_ONLINE (novo WiFi + AP)
   ✗ Se falhou → ST_CONFIG_PORTAL (AP ativo para retry)
```

**Timeline:**
```
T+0s:   POST /save (novo WiFi salvo)
T+1s:   portalSaved = true
T+2s:   Loop: state = ST_WIFI_CONNECT
T+3s:   connectSTA() inicia Dual Mode
T+10s:  Conecta ao novo WiFi ✓
T+15s:  doClaim() envia novo code
T+16s:  ST_ONLINE (ambos ativos)
```

---

## 📱 Aplicativo Frontend (JavaScript)

### Detectar Dual Mode Status

```javascript
class YagutsConnectivity {
  async checkDualStatus() {
    try {
      const res = await fetch('http://192.168.4.1/connectivity-status', {
        timeout: 5000
      });
      const status = await res.json();
      
      return {
        mode: status.sta_connected ? 'PRODUCTION' : 'FALLBACK',
        ap_active: status.ap_active,
        sta_connected: status.sta_connected,
        ap_url: `http://${status.ap_ip}`,
        sta_ip: status.sta_ip,
        rssi: status.rssi,
        ap_ssid: status.ap_ssid
      };
    } catch (e) {
      return {
        mode: 'OFFLINE',
        error: e.message
      };
    }
  }
  
  async monitorConnection() {
    setInterval(async () => {
      const status = await this.checkDualStatus();
      
      // Atualizar UI
      const icon = status.sta_connected ? '🟢' : '🟡';
      const text = status.sta_connected ? 
        `Online (${status.rssi} dBm)` : 
        'Modo Fallback';
      
      document.querySelector('#connectivity-badge').innerHTML = 
        `${icon} ${text}`;
        
      // Log detalhado
      console.log('Connectivity:', status);
    }, 10000);  // A cada 10s
  }
  
  async triggerRepairingMode() {
    // Abre dialog para re-pareamento
    window.location.href = 'http://192.168.4.1';
  }
}

// Usar
const connectivity = new YagutsConnectivity();
connectivity.monitorConnection();
```

### UI Badge

```html
<!-- Status de conectividade -->
<div id="connectivity-badge" class="status-badge">
  <span class="icon">🔴</span>
  <span class="text">Desconectado</span>
</div>

<style>
.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 20px;
  background: #f0f0f0;
  font-size: 14px;
  font-weight: 500;
}

.status-badge .icon { font-size: 16px; }
.status-badge.online { background: #d4edda; color: #155724; }
.status-badge.fallback { background: #fff3cd; color: #856404; }
.status-badge.offline { background: #f8d7da; color: #721c24; }
</style>
```

---

## 🔍 Troubleshooting

### Problema: Hotspot não aparece no WiFi
```
Solução:
1. Reinicia ESP32
2. Serial deve mostrar:
   "[APSTA] ✓ AP ativo: Yaguts-XXXXX"
   "[APSTA]   IP Local: 192.168.4.1"
   
Se não aparecer:
3. Verifica power supply (min 500mA)
4. Verifica pinos SDA/SCL não conflitam
```

### Problema: Conecta ao hotspot mas página não carrega
```
Solução:
1. Verifica IP obtido (deve ser 192.168.4.x)
2. Tenta acessar http://192.168.4.1/info
3. Se responde, AP está OK
4. Se não responde, HTTP server pode não estar iniciado
   - Serial deve mostrar: "[HTTP] server iniciado"
```

### Problema: Re-pareou mas não conecta ao novo WiFi
```
Solução:
1. Verifica credenciais salvas (POST /save funcionou?)
2. Conecta ao hotspot e acessa /info
3. Serial deve exibir:
   "[STA] Conectando em 'NovoWiFi'..."
   "[STA] Falha ao conectar ao Yaguts (AP permanece ativo)"
4. Tenta novamente com senha correta
```

### Problema: WiFi Yaguts caiu e não reconecta
```
Solução:
1. Verifica se WiFi voltou online
2. Conecta ao hotspot para monitorar
   curl http://192.168.4.1/connectivity-status
3. Se sta_connected = false, tenta:
   - Reiniciar ESP32
   - Mudar WiFi via hotspot
   - Resetar credenciais (POST /wipe)
```

---

## 📊 Monitoramento via Serial

### Saída esperada durante operação normal

```
=== Yaguts Dispenser (ESP32) ===
UID: A1B2C3D4  MAC: AA:BB:CC:DD:EE:FF  FW: 0.1.5

[SERVO] Inicializando I2C...
[SERVO] ✓ PCA9685 inicializado com sucesso!

[PREFS] api_host='api.yaguts.com.br' token_len=32 claim=(none)

[STA] Iniciando Dual Mode...
[APSTA] ✓ AP ativo: Yaguts-A1B2C3D4
[APSTA]   IP Local: 192.168.4.1

[STA] Conectando em 'WiFi-Lab'...
[APSTA] 🔌 Conectando ao WiFi Yaguts: WiFi-Lab...
[APSTA] ✓ Conectado ao Yaguts: 192.168.1.100
[APSTA]   Sinal: -45 dBm

[STATE] ONLINE (com AP de fallback)

[HB] HTTP 200
[POLL] ✓ Job recebido!
[POLL] Job 42 salvo em Flash para execução offline
[EXEC] Iniciando execução do job 42
[EXEC] ✓ Item 1 concluído (real: 2.15s). Progresso salvo.
[REPORT] ✓ Relatório enviado com sucesso!
```

### Saída esperada durante fallback

```
[LOOP] ⚠ WiFi Yaguts desconectou. Tentando reconectar...
[APSTA] 🔄 Reconectando ao Yaguts...
.....
[APSTA] ⚠ Reconexão falhou (AP continua ativo)
[LOOP] ⚠ WiFi Yaguts desconectou. Tentando reconectar...
[STA] ⚠ Falha ao conectar ao Yaguts (AP permanece ativo)
```

---

## 🎯 Casos de Teste

### Teste 1: Operação Normal
```
1. Reinicia ESP32
2. Conecta ao hotspot Yaguts-XXXXX
3. Acessa http://192.168.4.1
4. Preenche WiFi + code
5. Clica Salvar
6. Serial deve exibir: [STATE] ONLINE (com AP de fallback)
✓ PASS
```

### Teste 2: Fallback Automático
```
1. ESP32 operando online
2. Desliga WiFi Yaguts (router)
3. Aguarda 15s
4. Conecta ao hotspot Yaguts-XXXXX
5. Verifica: curl http://192.168.4.1/connectivity-status
6. Deve retornar: sta_connected = false, ap_active = true
7. Religa WiFi Yaguts
8. Aguarda 30s
9. Verifica novamente: sta_connected = true
✓ PASS
```

### Teste 3: Re-pareamento Online
```
1. ESP32 operando com WiFi-Antigo
2. Conecta ao hotspot (ainda em operação!)
3. Acessa http://192.168.4.1
4. Muda para WiFi-Novo + novo code
5. Clica Salvar
6. ESP32 tenta conectar ao WiFi-Novo
7. Se ✓ conectou:
   - Serial: [STATE] ONLINE (com AP de fallback)
   - Pode fazer curl http://192.168.4.1/connectivity-status
✓ PASS
```

---

## 📚 Referência Rápida

| Estado | AP Ativo | STA Conectado | Ação |
|--------|----------|---------------|------|
| **Parado** | ✓ | ✗ | Espera config via hotspot |
| **Online** | ✓ | ✓ | Executa jobs + hotspot |
| **Fallback** | ✓ | ✗ | Tenta reconectar auto |
| **Re-pareando** | ✓ | 🔄 | Muda WiFi, tenta conectar |

---

## 🔗 Links Úteis

- 📄 [Documentação Técnica](ESP32_WIFI_DUAL_MODE.md)
- 🔧 [Código ESP32](esp32/dispenser.ino/dispenser/dispenser.ino)
- 🌐 [Hotspot Local](http://192.168.4.1)

---

**Última atualização**: Nov 15, 2025  
**Versão ESP32**: 0.1.5+  
**Status**: ✅ Pronto para produção
