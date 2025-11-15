/*
  job_persistence.h - Persistência de Jobs em Flash (Preferences)
  
  Permite que ESP32 execute jobs offline e recupere após crash/reboot
  
  Uso:
    JobState job;
    saveJob(job);        // Salva em Flash
    loadJob(job);        // Carrega do Flash
    clearJob();          // Limpa Flash
*/

#pragma once
#include <Preferences.h>
#include <ArduinoJson.h>

// ===================================================================
// Estrutura para persistência de Job
// ===================================================================
struct JobState {
  int jobId = 0;                  // ID do job
  int totalItens = 0;             // Total de itens a executar
  int itensConcluidos = 0;        // Itens completados com sucesso
  int itensFalhados = 0;          // Itens que falharam
  unsigned long timestampInicio = 0;  // Quando iniciou
  char jsonPayload[4096] = {0};   // JSON completo do job (do backend)
  char logPayload[2048] = {0};    // JSON com log de execução
};

// ===================================================================
// Funções de Persistência
// ===================================================================

/**
 * Salva estado do job em Flash (Preferences)
 * @param state JobState a salvar
 * @return true se sucesso
 */
bool saveJob(JobState& state) {
  Preferences prefs;
  prefs.begin("job_state", false);  // namespace "job_state", modo write
  
  prefs.putInt("job_id", state.jobId);
  prefs.putInt("total", state.totalItens);
  prefs.putInt("done", state.itensConcluidos);
  prefs.putInt("failed", state.itensFalhados);
  prefs.putULong("ts_inicio", state.timestampInicio);
  prefs.putString("json", state.jsonPayload);
  prefs.putString("log", state.logPayload);
  
  prefs.end();
  
  Serial.printf("[PERSIST] Job %d salvo em Flash (done:%d, failed:%d)\n", 
    state.jobId, state.itensConcluidos, state.itensFalhados);
  
  return true;
}

/**
 * Carrega estado do job do Flash
 * @param state JobState onde carregar
 * @return true se houver job salvo, false caso contrário
 */
bool loadJob(JobState& state) {
  Preferences prefs;
  prefs.begin("job_state", true);  // namespace "job_state", modo read
  
  state.jobId = prefs.getInt("job_id", 0);
  
  // Se não houver job salvo, retorna false
  if (!state.jobId) {
    prefs.end();
    Serial.println("[PERSIST] Nenhum job em Flash");
    return false;
  }
  
  state.totalItens = prefs.getInt("total", 0);
  state.itensConcluidos = prefs.getInt("done", 0);
  state.itensFalhados = prefs.getInt("failed", 0);
  state.timestampInicio = prefs.getULong("ts_inicio", millis());
  
  // Carrega strings (JSON)
  String json_str = prefs.getString("json", "");
  String log_str = prefs.getString("log", "");
  
  prefs.end();
  
  // Copia strings para buffers do struct
  strncpy(state.jsonPayload, json_str.c_str(), sizeof(state.jsonPayload) - 1);
  strncpy(state.logPayload, log_str.c_str(), sizeof(state.logPayload) - 1);
  
  Serial.printf("[PERSIST] Job %d carregado do Flash (done:%d, failed:%d)\n", 
    state.jobId, state.itensConcluidos, state.itensFalhados);
  
  return true;
}

/**
 * Limpa job do Flash
 * @return true se sucesso
 */
bool clearJob() {
  Preferences prefs;
  prefs.begin("job_state", false);
  prefs.clear();  // Remove tudo do namespace
  prefs.end();
  
  Serial.println("[PERSIST] Job limpo do Flash");
  return true;
}

/**
 * Verifica se há job pendente no Flash
 * @return true se houver
 */
bool hasJobInFlash() {
  Preferences prefs;
  prefs.begin("job_state", true);
  int job_id = prefs.getInt("job_id", 0);
  prefs.end();
  
  return (job_id > 0);
}
