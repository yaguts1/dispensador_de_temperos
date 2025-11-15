# 🔧 Setup no Arduino IDE - Yaguts Dispenser ESP32

## ✅ Estrutura Atual (CORRIGIDA)

```
esp32/
├── dispenser.ino/                   ← PASTA DO SKETCH
│   ├── dispenser_main.ino          ⭐ TAB 1 - PRINCIPAL (WiFi, AP, API, polling)
│   ├── yaguts_types.h              ✅ TAB 2 - TIPOS (auto-incluído)
│   └── job_persistence.h           ✅ TAB 3 - PERSISTENCE (auto-incluído)
│
├── job_execution.ino               ⭐ TAB 4 - EXECUÇÃO (copia para novo tab)
│
└── README_ESP32_STRUCTURE.md        📖 Documentação anterior
```

---

## 🚀 Passos para Fazer Upload

### **Passo 1: Abrir o Projeto no Arduino IDE**

```
File → Open → Selecione o arquivo:
  c:\Users\thiag.AIGOOO\Documents\projetos_mecatronicos\dispensador_de_temperos\esp32\dispenser.ino\dispenser_main.ino
```

✅ Arduino IDE vai **automaticamente detectar e criar abas** para:
- `yaguts_types.h` (include local)
- `job_persistence.h` (include local)

### **Passo 2: Adicionar job_execution.ino como TAB**

1. **Sketch → New Tab** (ou clique no ➕)
2. **Nome:** `job_execution`
3. **Copie TODO o conteúdo** de `../job_execution.ino`
4. **Cole no novo tab**
5. **Ctrl+S** para salvar

**Resultado esperado:**
```
┌─────────────────────────────────────────────────┐
│ dispenser_main | yaguts_types | job_persis... │
│ job_execution  | [+]                           │
└─────────────────────────────────────────────────┘
```

### **Passo 3: Verificar Bibliotecas Obrigatórias**

Certifique-se que tem instaladas:

- **ESP32 Board Package**
  - Tools → Board Manager
  - Pesquise: `esp32`
  - Instale: `esp32 by Espressif Systems`

- **ArduinoJson** (versão 5.13+)
  - Sketch → Include Library → Manage Libraries
  - Pesquise: `ArduinoJson`
  - Instale a versão **5.13.0 ou superior**

### **Passo 4: Configurar Board & Portas**

```
Tools → Board:          ESP32 Dev Module
Tools → Upload Speed:   115200
Tools → Flash Freq:     80 MHz
Tools → Flash Mode:     QIO
Tools → Partition:      Default 4MB with spiffs
Tools → Port:           COM3 (ou qual detectar)
```

### **Passo 5: Compilar & Upload**

```
Sketch → Verify (Ctrl+R)     ← Testa compilação
Sketch → Upload (Ctrl+U)     ← Faz upload para ESP32
```

✅ Sucesso quando vir:
```
Leaving... Hard resetting via RTS pin...
```

---

## 🔍 Verificação - Arquivo Esperado

Quando abrir o projeto, deve ver exatamente isso:

**dispenser_main.ino (TAB 1):**
```cpp
/*
  ============================================================================
  YAGUTS DISPENSER - ESP32 MAIN
  
  v0.1.4 - WiFi + Portal + API + Job Polling
  ...
```

**job_execution.ino (TAB 4):**
```cpp
/*
  ============================================================================
  YAGUTS DISPENSER - JOB EXECUTION
  
  Arquivo TAB 2 do projeto (job_execution.ino)
  ...
```

**yaguts_types.h (TAB 2 - Auto):**
```cpp
struct ApiEndpoint {
  String host;
  uint16_t port;
  bool https;
};
```

**job_persistence.h (TAB 3 - Auto):**
```cpp
#pragma once
#include <Preferences.h>

struct JobState {
  int jobId = 0;
  ...
};
```

---

## ✅ Checklist Final

- [ ] Arduino IDE aberto com `dispenser_main.ino`
- [ ] 4 tabs visíveis (dispenser_main, yaguts_types, job_persistence, job_execution)
- [ ] ESP32 Board Package instalado
- [ ] ArduinoJson 5.13+ instalado
- [ ] Board: ESP32 Dev Module
- [ ] Port: COM3 (ou detectado)
- [ ] Clique **Verify** → ✓ Sem erros
- [ ] Clique **Upload** → ✓ Sucesso

---

## 🐛 Troubleshooting

### Erro: `fatal error: ArduinoJson.h`
**Solução:** Tools → Manage Libraries → ArduinoJson → Instale 5.13+

### Erro: `Board esp32 not found`
**Solução:** Tools → Board Manager → Pesquise "esp32" → Instale

### Erro: `Port COM3 not found`
**Solução:** Tools → Port → Selecione a porta detectada (COM#)

### Erro: `Job_execution' was not declared`
**Solução:** Verifique se criou o TAB `job_execution` com TODO o conteúdo

### Compilação lenta?
Normal. Primeira compilação leva 30-60 segundos. Próximas mais rápidas.

---

## 📚 Referência Rápida

| Ação | Atalho |
|------|--------|
| Verificar (compile) | **Ctrl+R** |
| Upload | **Ctrl+U** |
| Novo Tab | **Ctrl+Shift+N** |
| Serial Monitor | **Ctrl+Shift+M** |
| Salvar | **Ctrl+S** |

---

## 🎯 Próximos Passos Após Upload

1. **Abra Serial Monitor** (Ctrl+Shift+M)
   - Baud: 115200

2. Você deve ver:
   ```
   === Yaguts Dispenser (ESP32) v0.1.4 ===
   UID: A1B2C3D4E5F6  MAC: AA:BB:CC:DD:EE:FF
   [PREFS] api='api.yaguts.com.br' token_len=0 claim=(none)
   [SETUP] Job anterior detectado em Flash
   [STATE] ONLINE
   [WIFI] Conectando em 'SeuSSID' ...
   [WIFI] OK. IP: 192.168.1.100 RSSI:-50
   ```

3. Se aparecer erro 401, vá para o portal:
   - Conecte em WiFi: `Yaguts-E5F6`
   - Acesse: `http://192.168.4.1`
   - Insira SSID + Código de vínculo (6 dígitos)

---

## ✅ Setup Concluído!

Parabéns! Seu ESP32 está pronto para:
- ✅ Conectar em WiFi
- ✅ Fazer claim via portal
- ✅ Executar jobs offline
- ✅ Reportar ao backend
- ✅ Recuperar após crash

**Dúvidas?** Veja `README.md` na raiz do projeto!
