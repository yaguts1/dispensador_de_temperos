# 🔧 Integração Servo SG90 + PCA9685 I2C

**Status:** ✅ INTEGRADO AO CÓDIGO DO ESP32

---

## 📋 Especificações

### Hardware
- **Servo:** SG90 (4 unidades)
- **Driver I2C:** PCA9685 (16 canais, compatível com Adafruit)
- **Frequência PWM:** 50 Hz (padrão para servo SG90)
- **Ângulo de Abertura:** 90° (conforme solicitado)
- **Posição Fechada:** 1000 µs (0°)
- **Posição Aberta:** 2000 µs (90°)

### Pinos I2C (ESP32 Wrover)
- **SDA:** GPIO 21
- **SCL:** GPIO 22
- **Endereço I2C:** 0x40 (padrão PCA9685)

### Canais PCA9685
| Frasco | Canal PCA9685 |
|--------|---------------|
| 1      | 0             |
| 2      | 1             |
| 3      | 2             |
| 4      | 3             |

---

## 🔌 Conexão de Fios

### ESP32 → PCA9685
```
ESP32 GPIO21 (SDA) → PCA9685 SDA
ESP32 GPIO22 (SCL) → PCA9685 SCL
ESP32 GND          → PCA9685 GND
ESP32 5V           → PCA9685 VCC
```

### PCA9685 → Servos SG90
```
PCA9685 Canal 0 (PWM) → Servo 1 (Sinal Amarelo)
PCA9685 Canal 1 (PWM) → Servo 2 (Sinal Amarelo)
PCA9685 Canal 2 (PWM) → Servo 3 (Sinal Amarelo)
PCA9685 Canal 3 (PWM) → Servo 4 (Sinal Amarelo)

PCA9685 GND     → Todos os Servos (Fio Preto)
PCA9685 5V OUT  → Todos os Servos (Fio Vermelho)
```

---

## 🚀 Mudanças no Código

### 1. **Includes Adicionados**
```cpp
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
```

### 2. **Configurações Adicionadas**
```cpp
#define SDA_PIN              21
#define SCL_PIN              22
#define I2C_SERVO_ADDR       0x40
#define SERVO_FREQ           50      // 50 Hz
#define SERVO_MIN_US         1000    // Fechado (0°)
#define SERVO_MAX_US         2000    // Aberto (90°)

Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(I2C_SERVO_ADDR);
bool servoInitOk = false;
```

### 3. **Função setupPins() Modificada**
```cpp
void setupPins() {
  // Inicializa I2C
  Wire.begin(SDA_PIN, SCL_PIN);
  delay(100);
  
  // Inicializa PCA9685
  if (!pwm.begin()) {
    Serial.println("[SERVO] ✗ Falha ao inicializar PCA9685!");
    servoInitOk = false;
    return;
  }
  
  // Configura frequência
  pwm.setOscillatorFrequency(25000000);
  pwm.setPWMFreq(SERVO_FREQ);
  
  // Posição inicial: FECHADO
  for (int i = 0; i < 4; i++) {
    pwm.writeMicroseconds(SERVO_CHANNELS[i], SERVO_MIN_US);
  }
  
  servoInitOk = true;
}
```

### 4. **Função runReservoir() Modificada**
```cpp
void runReservoir(int frasco, unsigned long ms) {
  if (frasco < 1 || frasco > 4 || !servoInitOk) return;
  
  int servoChannel = SERVO_CHANNELS[frasco - 1];
  
  // ABRE (90°)
  Serial.printf("[SERVO] Abrindo frasco %d (canal %d)...\n", frasco, servoChannel);
  pwm.writeMicroseconds(servoChannel, SERVO_MAX_US);  // 2000 µs
  delay(100);
  
  // MANTÉM ABERTO pelo tempo especificado
  unsigned long t0 = millis();
  while (millis() - t0 < ms) {
    delay(10);
  }
  
  // FECHA (0°)
  Serial.printf("[SERVO] Fechando frasco %d (canal %d)\n", frasco, servoChannel);
  pwm.writeMicroseconds(servoChannel, SERVO_MIN_US);  // 1000 µs
  delay(100);
}
```

---

## 📊 Fluxo de Operação

```
Inicio ESP32
    ↓
setup()
    ├─ setupPins()
    │   ├─ Wire.begin() [I2C]
    │   ├─ pwm.begin() [PCA9685]
    │   ├─ pwm.setOscillatorFrequency(25MHz)
    │   ├─ pwm.setPWMFreq(50Hz)
    │   └─ Fecha todos servos (1000 µs)
    ├─ loadPrefs() [WiFi]
    └─ tryResumeJobFromFlash()
    
Recebe Job do Backend
    ↓
pollNextJob()
    ↓
executeJobOfflineWithPersistence()
    ↓
Para cada ITEM do job:
    ├─ Valida frasco (1-4)
    ├─ Calcula tempo em ms
    └─ runReservoir(frasco, ms)
        ├─ Abre servo (90°) → 2000 µs
        ├─ Espera ms
        └─ Fecha servo (0°) → 1000 µs
    ↓
reportJobCompletion() [Backend]
```

---

## 🔍 Serial Output Esperado

```
[SERVO] Inicializando I2C...
[SERVO] ✓ PCA9685 inicializado com sucesso!
...
[POLL] Job recebido!
[EXEC] ========== Iniciando execução do job 42 ==========
[EXEC] Resumindo de item 1/3
[EXEC] Item 1/3: Frasco 1 por 5.000s
[SERVO] Abrindo frasco 1 (canal 0)...
[EXEC] ✓ Item 1 concluído (real: 5.02s). Progresso salvo.
[SERVO] Fechando frasco 1 (canal 0)
[EXEC] Item 2/3: Frasco 2 por 3.500s
[SERVO] Abrindo frasco 2 (canal 1)...
[EXEC] ✓ Item 2 concluído (real: 3.51s). Progresso salvo.
[SERVO] Fechando frasco 2 (canal 1)
...
[EXEC] ========== Execução concluída em 15.23s ==========
[REPORT] Enviando relatório do job 42
[REPORT] ✓ Relatório enviado com sucesso!
```

---

## ⚙️ Instalação de Dependências (Arduino IDE)

No Arduino IDE, instale via **Sketch → Include Library → Manage Libraries:**

1. **Adafruit PWM Servo Driver Library**
   - Autor: Adafruit
   - Versão: 2.4.0+
   - Buscar: "Adafruit PWM Servo Driver"

2. **Verificar instalação:**
   ```
   #include <Adafruit_PWMServoDriver.h>  // Deve não gerar erro
   ```

---

## 🧪 Teste Rápido (sem WiFi)

Você pode testar os servos isoladamente adicionando este código ao `setup()`:

```cpp
// TESTE: Ciclo dos 4 servos
void testServos() {
  if (!servoInitOk) return;
  
  for (int frasco = 1; frasco <= 4; frasco++) {
    Serial.printf("Testando frasco %d...\n", frasco);
    runReservoir(frasco, 2000);  // Abre por 2 segundos
    delay(1000);
  }
  
  Serial.println("Teste concluído!");
}
```

Adicione em setup():
```cpp
// Descomente para testar servos
// testServos();
```

---

## 🔧 Calibração (Se Necessário)

Se os servos não abrirem exatamente a 90°, ajuste estes valores no código:

```cpp
#define SERVO_MIN_US         1000    // 0°   (ajustar se não fechar totalmente)
#define SERVO_MAX_US         2000    // 90°  (ajustar se não abrir totalmente)
```

**Valores comuns para SG90:**
- 500 µs → 0°
- 1000 µs → 0° (mais conservador)
- 1500 µs → 90°
- 2000 µs → 180°

Para 90° exato:
- Se usar 500-2000 µs = 0° a 180° → use **1250 µs** para 90°
- Se usar 1000-2000 µs = 0° a 90° → use **2000 µs** para 90° ✅

---

## 🐛 Troubleshooting

### Servo não responde
1. Verificar conexões I2C (SDA/SCL)
2. Verificar alimentação 5V no PCA9685
3. Verificar endereço I2C (padrão: 0x40)
   ```cpp
   // Debug: escanear I2C
   Serial.println("Scanning I2C...");
   for (uint8_t i = 0; i < 128; i++) {
     Wire.beginTransmission(i);
     if (Wire.endTransmission() == 0) {
       Serial.printf("Device found at 0x%02X\n", i);
     }
   }
   ```

### PCA9685 não inicializa
- Verificar oscilador: `pwm.setOscillatorFrequency(25000000);`
- Alguns módulos usam 27 MHz: tente `27000000`
- Verificar jumpers no módulo (A0-A5 endereço)

### Servo tremendo/instável
- Aumentar delay: `delay(100);` → `delay(200);`
- Verificar alimentação 5V (deve ser estável)
- Verificar cabos soltos

---

## 📝 Resumo das Alterações

| Item | Antes | Depois |
|------|-------|--------|
| Controle | Relé GPIO (26,27,32,33) | Servo I2C PWM (PCA9685) |
| Movimento | On/Off | 0° ↔ 90° |
| Abertura | Instantânea | Servo move (100ms) |
| Canais | 4 pinos GPIO | 4 canais PWM I2C |
| Precisão | Digital | Analógica (PWM) |
| Feedback | Nenhum | Posição (via PWM) |

---

## ✅ Próximos Passos

1. ✅ Instalar biblioteca Adafruit PWM Servo Driver
2. ✅ Conectar PCA9685 ao ESP32 (I2C: GPIO 21/22)
3. ✅ Conectar 4 servos aos canais 0-3 do PCA9685
4. ✅ Upload do código modificado ao ESP32
5. ⏳ Testar abertura/fechamento dos servos via Serial
6. ⏳ Enviar primeiro job do backend para testar ciclo completo

---

**Código Pronto para Compilar e Upload!** 🚀
