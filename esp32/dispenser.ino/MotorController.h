/*
  ============================================================================
  MOTOR CONTROLLER - L298N Bridge Driver para Motor DC 12V
  
  Controle de motor de vibração com PWM (LEDC) para melhorar fluxo de temperos.
  
  Hardware:
  - Motor DC 12V (vibração)
  - Ponte H L298N
  - Pinos: ENA (PWM), IN1 (direção), IN2 (direção)
  - Alimentação: 12V externa (NÃO usar 5V do ESP)
  
  Recursos:
  - Controle de intensidade via PWM (0-100%)
  - Ramp-up/down suave
  - Timeout de segurança automático
  - Delays pré/pós dispensação
  
  ============================================================================
*/

#ifndef MOTOR_CONTROLLER_H
#define MOTOR_CONTROLLER_H

#include <Arduino.h>

// Configurações PWM (LEDC)
#define MOTOR_PWM_FREQ      1000    // 1kHz
#define MOTOR_PWM_RESOLUTION 8      // 8-bit (0-255)
#define MOTOR_PWM_CHANNEL   0       // Canal LEDC 0

// Ramp timing (ms)
#define MOTOR_RAMP_STEP_MS  20      // Tempo entre steps do ramp
#define MOTOR_RAMP_STEP_VAL 10      // Incremento de PWM por step

class MotorController {
private:
    int enaPin;           // PWM pin (Enable A do L298N)
    int in1Pin;           // Direction control 1
    int in2Pin;           // Direction control 2
    
    int intensity;        // 0-100%
    int currentPwm;       // PWM atual (0-255)
    
    bool running;
    unsigned long startTime;
    unsigned long maxRuntimeMs;
    
    // Converte % para PWM (0-255)
    int percentToPwm(int percent) {
        if (percent < 0) percent = 0;
        if (percent > 100) percent = 100;
        return (percent * 255) / 100;
    }
    
    // Ramp-up suave (evita pico de corrente)
    void rampUp(int targetPwm) {
        int current = currentPwm;
        while (current < targetPwm) {
            current += MOTOR_RAMP_STEP_VAL;
            if (current > targetPwm) current = targetPwm;
            
            ledcWrite(MOTOR_PWM_CHANNEL, current);
            currentPwm = current;
            delay(MOTOR_RAMP_STEP_MS);
        }
    }
    
    // Ramp-down suave
    void rampDown() {
        int current = currentPwm;
        while (current > 0) {
            current -= MOTOR_RAMP_STEP_VAL;
            if (current < 0) current = 0;
            
            ledcWrite(MOTOR_PWM_CHANNEL, current);
            currentPwm = current;
            delay(MOTOR_RAMP_STEP_MS);
        }
    }

public:
    MotorController(int ena, int in1, int in2) 
        : enaPin(ena), in1Pin(in1), in2Pin(in2),
          intensity(75), currentPwm(0), running(false),
          startTime(0), maxRuntimeMs(300000) {}  // 5min default
    
    // Inicializa pinos e PWM
    void begin() {
        pinMode(enaPin, OUTPUT);
        pinMode(in1Pin, OUTPUT);
        pinMode(in2Pin, OUTPUT);
        
        // Configura direção (fixa - apenas vibração)
        digitalWrite(in1Pin, HIGH);
        digitalWrite(in2Pin, LOW);
        
        // Configura PWM (LEDC)
        ledcSetup(MOTOR_PWM_CHANNEL, MOTOR_PWM_FREQ, MOTOR_PWM_RESOLUTION);
        ledcAttachPin(enaPin, MOTOR_PWM_CHANNEL);
        ledcWrite(MOTOR_PWM_CHANNEL, 0);
        
        currentPwm = 0;
        running = false;
        
        Serial.printf("[MOTOR] Inicializado: ENA=%d IN1=%d IN2=%d\n", 
                      enaPin, in1Pin, in2Pin);
    }
    
    // Define intensidade (0-100%)
    void setIntensity(int percent) {
        if (percent < 0) percent = 0;
        if (percent > 100) percent = 100;
        intensity = percent;
        Serial.printf("[MOTOR] Intensidade ajustada: %d%%\n", intensity);
    }
    
    // Define timeout máximo de segurança (segundos)
    void setMaxRuntime(int seconds) {
        if (seconds < 30) seconds = 30;
        if (seconds > 600) seconds = 600;
        maxRuntimeMs = (unsigned long)seconds * 1000UL;
    }
    
    // Inicia motor com delay opcional
    void start(int preDelayMs = 0) {
        if (running) {
            Serial.println("[MOTOR] ⚠ Já está rodando");
            return;
        }
        
        if (intensity == 0) {
            Serial.println("[MOTOR] ⊘ Intensidade 0% - motor não iniciado");
            return;
        }
        
        Serial.printf("[MOTOR] Iniciando (delay pré: %dms, intensidade: %d%%)\n", 
                      preDelayMs, intensity);
        
        // Delay PRÉ-dispensação
        if (preDelayMs > 0) {
            delay(preDelayMs);
        }
        
        // Ramp-up suave
        int targetPwm = percentToPwm(intensity);
        rampUp(targetPwm);
        
        running = true;
        startTime = millis();
        
        Serial.println("[MOTOR] ✓ Rodando");
    }
    
    // Para motor com delay opcional
    void stop(int postDelayMs = 0) {
        if (!running) {
            Serial.println("[MOTOR] Já está parado");
            return;
        }
        
        Serial.printf("[MOTOR] Parando (delay pós: %dms)\n", postDelayMs);
        
        // Delay PÓS-dispensação (motor continua rodando)
        if (postDelayMs > 0) {
            delay(postDelayMs);
        }
        
        // Ramp-down suave
        rampDown();
        
        running = false;
        startTime = 0;
        
        Serial.println("[MOTOR] ✓ Parado");
    }
    
    // Para imediatamente (emergência)
    void forceStop() {
        if (!running) return;
        
        Serial.println("[MOTOR] ⚠ PARADA DE EMERGÊNCIA");
        ledcWrite(MOTOR_PWM_CHANNEL, 0);
        currentPwm = 0;
        running = false;
        startTime = 0;
    }
    
    // Verifica timeout de segurança (chamar no loop)
    bool checkTimeout() {
        if (!running) return false;
        
        unsigned long elapsed = millis() - startTime;
        if (elapsed >= maxRuntimeMs) {
            Serial.printf("[MOTOR] ✗ TIMEOUT (%.1fs) - desligando!\n", 
                          elapsed / 1000.0);
            forceStop();
            return true;  // Timeout ocorreu
        }
        return false;
    }
    
    // Status
    bool isRunning() const { return running; }
    int getIntensity() const { return intensity; }
    unsigned long getRuntime() const { 
        return running ? (millis() - startTime) : 0; 
    }
};

#endif // MOTOR_CONTROLLER_H
