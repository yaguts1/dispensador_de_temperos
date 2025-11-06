# 🚀 FASE 2 - ESP32 OFFLINE-FIRST EXECUTION

## ✅ Implementação Completa

### Arquivos Criados/Modificados

#### 1. **`esp32/job_persistence.h`** (NOVO)
Header com funções para persistência em Flash:
- `saveJob(state)` - Salva job em Flash (Preferences)
- `loadJob(state)` - Carrega job do Flash
- `clearJob()` - Limpa job do Flash
- `hasJobInFlash()` - Verifica se há job pendente

#### 2. **`esp32/job_execution.ino`** (NOVO)
Funções de execução offline:
- `executeJobOfflineWithPersistence()` - Executa job localmente, salva progresso
- `reportJobCompletion()` - Reporta resultado ao backend
- `addToExecutionLog()` - Adiciona item ao log
- `tryResumeJobFromFlash()` - Retoma job após crash/reboot

#### 3. **`esp32/dispenser.ino`** (MODIFICADO)
Modificações para integração:
- ✅ Adicionado `#include "job_persistence.h"`
- ✅ Adicionadas variáveis globais de job (extern)
- ✅ Modificado `pollNextJob()` - Salva em Flash + executa offline
- ✅ Modificado `setup()` - Tenta retomar job anterior
- ✅ Modificado `loop()` - Retry de report a cada 30s

---

## 🔄 Fluxo de Execução (Offline-First)

### Cenário 1: Execução Normal (WiFi Estável)

```
1. Poll GET /devices/me/next_job
   ↓
2. Recebe job JSON → Salva em Flash
   ↓
3. Executa executeJobOfflineWithPersistence()
   - Lê JSON do Flash
   - Loop por cada frasco (salva progresso após cada um)
   - Se WiFi cai → continua executando localmente
   - Se ESP32 trava → Flash recupera progresso
   ↓
4. Reporta POST /devices/me/jobs/{id}/complete
   - Envia execution logs
   - Backend abate estoque SOMENTE de itens com status="done"
   ↓
5. ✅ Limpa job do Flash
```

### Cenário 2: WiFi Cai Durante Execução

```
1. Poll recebe job → Salva em Flash
   ↓
2. executeJobOfflineWithPersistence()
   Item 1: ✓ OK → Salva em Flash
   Item 2: ✓ OK → Salva em Flash
   WiFi CAI aqui ⚡
   Item 3: ✓ OK (continua sem WiFi!)
   Item 4: ✓ OK (continua sem WiFi!)
   ↓
3. WiFi reconecta
   ↓
4. Loop detecta: g_lastReportAttempt passou REPORT_RETRY_INTERVAL
   ↓
5. reportJobCompletion() → POST /complete
   - Envia: { completados: 4, falhados: 0, logs: [...] }
   - Backend: Abate todo estoque
   - Flash: Limpo
   ↓
6. ✅ Job foi executado completamente offline-safe
```

### Cenário 3: ESP32 Trava Durante Execução

```
1. Recebe job → Salva em Flash
   ↓
2. Executa Item 1 ✓ → Salva em Flash { itensConcluidos: 1 }
   Executa Item 2 ✓ → Salva em Flash { itensConcluidos: 2 }
   ESP32 TRAVA/REBOOT aqui 💥
   ↓
3. Boot → setup() executa
   - loadPrefs() → Carrega WiFi
   - tryResumeJobFromFlash() → DETECTA job!
     * Carrega: jobId, totalItens, itensConcluidos=2
   - Aguarda conectar ao WiFi
   ↓
4. Conecta → ST_ONLINE
   ↓
5. pollNextJob() executa
   - Executa de item 3 em diante
   - Item 3 ✓, Item 4 ✓
   - Total: 4/4 completados
   ↓
6. reportJobCompletion() → POST
   - Backend recebe: completados=4
   - Abate estoque
   ↓
7. ✅ Job completamente recuperado!
```

---

## 🧪 Como Testar

### Teste 1: Execução Normal
```
1. Ligar ESP32 com WiFi OK
2. Enviar job via API (4 frascos)
3. Observar Serial:
   [POLL] ✓ Job recebido!
   [POLL] Job X salvo em Flash para execução offline
   [EXEC] Iniciando execução do job X
   [EXEC] Item 1/4: Frasco 1 por 5.000s
   [EXEC] ✓ Item 1 concluído (real: 5.02s). Progresso salvo.
   ...
   [EXEC] Execução concluída em 23.45s
   [REPORT] Enviando relatório do job X
   [REPORT] ✓ Relatório enviado com sucesso!
```

### Teste 2: WiFi Cai Durante Execução
```
1. Enviar job (4 frascos)
2. Deixar executar 2 frascos
3. DESLIGAR WiFi
4. Observar: continua executando frascos 3 e 4
5. LIGAR WiFi
6. Observar: [REPORT] ✓ Relatório enviado com sucesso!
7. Verificar no backend: job.status = "done", estoque abatido
```

### Teste 3: ESP32 Reboot Durante Execução
```
1. Enviar job (4 frascos)
2. Deixar executar 2 frascos
3. RESET ESP32 (apertar botão ou WDT)
4. Observar Serial ao reiniciar:
   [SETUP] Job anterior detectado, será retomado ao conectar
   ...
   [RESUME] ⚡ Job pendente detectado em Flash!
   [RESUME] Retomando job X (item 3/4)
5. Vai executar frascos 3 e 4
6. Reporta com sucesso
```

### Teste 4: Report Falha, Retry Automático
```
1. Enviar job
2. Bloquear POST /complete (firewall ou backend down)
3. Observar Serial:
   [REPORT] ✗ Falha ao reportar: HTTP 0
   [REPORT] Mantendo job em Flash para retry posterior
4. Aguardar 30s (REPORT_RETRY_INTERVAL)
5. Observar:
   [LOOP] Tentando reportar job pendente...
   [REPORT] ✓ Relatório enviado com sucesso!
```

---

## 📊 Constantes Importantes

```cpp
// job_persistence.h
// Espaço em Flash para JSON job
char jsonPayload[4096]   // ~4KB para job + itens

// dispenser.ino
const unsigned long REPORT_RETRY_INTERVAL = 30000;  // Retry a cada 30s
const unsigned long MAX_STEP_MS = 180000UL;         // Max 3min por frasco
```

---

## ✨ Benefícios

✅ **Offline-Safe**: Executa sem WiFi, reporta quando reconecta  
✅ **Crash-Safe**: Recupera progresso após reboot  
✅ **Resiliente**: WiFi cai? Continua executando  
✅ **Idempotente**: Report duplicado = sem duplicação de estoque  
✅ **Auditável**: Log detalhado por frasco em JSON  

---

## 🔍 Como Funciona Internamente

### JobState Structure
```cpp
struct JobState {
  int jobId;                      // ID do job (backend)
  int totalItens;                 // Número de itens a executar
  int itensConcluidos;            // Contador: quantos completaram OK
  int itensFalhados;              // Contador: quantos falharam
  unsigned long timestampInicio;  // Quando iniciou
  char jsonPayload[4096];         // JSON COMPLETO do job do backend
  char logPayload[2048];          // JSON com log de execução
};
```

### Flash Storage (Preferences)
```
Namespace: "job_state"
├─ job_id (int)
├─ total (int)
├─ done (int)
├─ failed (int)
├─ ts_inicio (ulong)
├─ json (string) ← JSON job completo
└─ log (string)  ← Log de execução
```

### Persistência Strategy
- **ANTES de executar**: Salva job completo em Flash
- **APÓS cada frasco**: Salva itensConcluidos atualizado
- **APÓS conclusão**: Reporta ao backend
- **Ao receber 200 OK**: Limpa Flash (job processado)

---

## 🐛 Debug

Ativar logs completos com `#define DEBUG_HTTP 1` em `dispenser.ino`.

Observe na Serial:
```
[POLL] - Polling de jobs
[EXEC] - Execução local
[REPORT] - Reporte ao backend
[PERSIST] - Salvamento em Flash
[RESUME] - Recuperação após crash
[LOOP] - Retry de report
```

---

## 📝 Próximas Etapas

- [ ] Testes com hardware real
- [ ] Teste de WiFi instável (conexões intermitentes)
- [ ] Teste com jobs de longa duração (>3 min)
- [ ] Frontend update para mostrar `partial_success`

