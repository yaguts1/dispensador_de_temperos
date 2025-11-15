# ✅ ARDUINO IDE - INSTRUÇÕES FINAIS

## 🎯 Estrutura Correta (AGORA PRONTA!)

```
esp32/
└── dispenser.ino/                    ← PASTA DO SKETCH
    ├── dispenser.ino                 ⭐ ARQUIVO PRINCIPAL (abra este)
    ├── yaguts_types.h                ✅ Auto-detectado
    ├── job_persistence.h             ✅ Auto-detectado
    └── dispenser/                    ← Pasta interna (ignore)
```

---

## 🚀 Como Fazer Upload (3 Passos)

### **Passo 1: FECHE Arduino IDE Completamente**
- Feche todas as abas
- File → Exit

### **Passo 2: REABRA com o arquivo correto**
```
File → Open
Procure e selecione EXATAMENTE:
  c:\Users\thiag.AIGOOO\Documents\projetos_mecatronicos\dispensador_de_temperos\esp32\dispenser.ino\dispenser.ino
```

✅ Arduino IDE vai automaticamente detectar:
- `yaguts_types.h` 
- `job_persistence.h`

E criar abas para eles!

### **Passo 3: Adicionar TAB com job_execution.ino**

1. **Sketch → New Tab** (ou Ctrl+Shift+N)
2. **Ao pedir nome, digite:** `job_execution`
3. **Copie TUDO** de: `c:\...\esp32\job_execution.ino`
4. **Cole** no novo tab
5. **Ctrl+S** para salvar

---

## ✅ Resultado Esperado

Você deve ver **4 abas** no topo:

```
┌───────────────────────────────────────────────┐
│ dispenser | yaguts_types | job_persistence   │
│ job_execution | [+]                           │
└───────────────────────────────────────────────┘
```

---

## ✅ Compilar & Testar

### **Teste de Compilação**
```
Sketch → Verify (Ctrl+R)
```

Deve aparecer algo como:
```
Sketch uses 587012 bytes of program storage space.
Global variables use 31416 bytes of dynamic memory.
```

### **Upload para ESP32**

1. **Conecte** ESP32 via USB
2. **Tools → Port** → Selecione COMx
3. **Sketch → Upload (Ctrl+U)**

Deve aparecer:
```
Leaving... Hard resetting via RTS pin...
```

### **Ver Serial Monitor**
```
Tools → Serial Monitor (Ctrl+Shift+M)
Baud: 115200
```

Deve ver:
```
=== Yaguts Dispenser (ESP32) v0.1.4 ===
UID: A1B2C3D4E5F6  MAC: AA:BB:CC:DD:EE:FF
[PREFS] api='api.yaguts.com.br' token_len=0 claim=(none)
```

---

## 🔧 Configurações do Board

Certifique-se que está:

```
Tools → Board:                ESP32 Wrover Module (ou ESP32 Dev Module)
Tools → Upload Speed:         921600 (ou 115200)
Tools → Flash Freq:           80 MHz
Tools → Flash Mode:           QIO
Tools → Partition Scheme:     Default 4MB with spiffs
Tools → Port:                 COM3 (ou qual aparecer)
```

---

## ❌ Se Ainda Não Compilar

### **Erro: yaguts_types.h not found**
- [ ] Feche completamente Arduino IDE
- [ ] Reabra com `dispenser.ino` (não dispenser_main.ino)
- [ ] Certifique-se que o arquivo está em `esp32/dispenser.ino/`

### **Erro: Undefined reference to executeJobOfflineWithPersistence**
- [ ] Você criou o TAB `job_execution`?
- [ ] Copiou TODO o conteúdo de `../job_execution.ino`?
- [ ] Salvou (Ctrl+S)?

### **Erro: Board not found**
- [ ] Tools → Board Manager
- [ ] Pesquise: `esp32`
- [ ] Instale: `esp32 by Espressif Systems`

### **Erro: ArduinoJson not found**
- [ ] Sketch → Include Library → Manage Libraries
- [ ] Pesquise: `ArduinoJson`
- [ ] Instale versão **5.13+**

---

## ✅ Checklist Final

- [ ] Arduino IDE fechado e reaberto
- [ ] Arquivo aberto: `dispenser.ino\dispenser.ino`
- [ ] Vejo 4 abas (dispenser, yaguts_types, job_persistence, job_execution)
- [ ] Sketch → Verify (Ctrl+R) → ✓ Sucesso
- [ ] ESP32 conectado via USB
- [ ] Port selecionado (COM#)
- [ ] Sketch → Upload (Ctrl+U) → ✓ Sucesso
- [ ] Serial Monitor mostra startup messages

---

## 🎉 Pronto!

Se chegou aqui, seu ESP32 está:
- ✅ Compilado
- ✅ Uploadado
- ✅ Pronto para testar

**Próximos passos:**
1. Configure WiFi via portal (192.168.4.1)
2. Insira código de vínculo (6 dígitos)
3. ESP32 se conecta ao backend
4. Comece a enviar jobs!

---

**Dúvidas? Veja os logs no Serial Monitor!**
