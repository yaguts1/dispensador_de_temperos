/*
  ============================================================================
  YAGUTS DISPENSER - JOB EXECUTION
  
  Arquivo TAB 2 do projeto (job_execution.ino)
  
  Implementa:
  - executeJobOfflineWithPersistence() - Executa job localmente
  - reportJobCompletion() - Reporta resultado ao backend
  - tryResumeJobFromFlash() - Recupera job após crash
  
  Compartilha globais com dispenser.ino:
  - g_currentJob
  - g_executionLog
  - g_lastReportAttempt
  
  ============================================================================
*/

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
