"""
Mock ESP32 Execution Simulator

Permite simular execução de jobs do ESP32 com:
- Delays reais (simula processamento)
- Falhas injetáveis (timeout, erro)
- Offline scenarios (WiFi drop durante execução)
- Automatic report retry (simula reconexão)

Uso:
  POST /devices/test/simulate-execution
  {
    "job_id": 123,
    "frasco_delay_ms": 2000,          # tempo por frasco
    "fail_frasco_indices": [2],       # quais frascos falham (0-indexed)
    "simulate_wifi_drop": true,       # WiFi cai no meio? Depois reconecta
    "drop_at_frasco_index": 1,        # em qual frasco cai WiFi
    "drop_duration_seconds": 5,       # quanto tempo fica offline
  }

Resposta:
  {
    "ok": true,
    "execution_log": [...],
    "final_report": {...}
  }
"""

import asyncio
import time
from typing import List, Optional
from datetime import datetime, timezone
import random

async def simulate_esp32_execution(
    job_id: int,
    job_itens: List[dict],  # [{"frasco": 1, "tempero": "sal", "quantidade_g": 50}, ...]
    device_id: int,
    api_base_url: str = "http://localhost:8000",
    frasco_delay_ms: int = 2000,
    fail_frasco_indices: Optional[List[int]] = None,
    simulate_wifi_drop: bool = False,
    drop_at_frasco_index: int = 0,
    drop_duration_seconds: int = 5,
):
    """
    Simula execução do ESP32 com suporte a falhas e WiFi drops.
    
    Retorna o payload que ESP32 enviaria para POST /devices/me/jobs/{job_id}/complete
    """
    fail_frasco_indices = fail_frasco_indices or []
    execution_logs = []
    
    print(f"\n[MOCK ESP32] Iniciando simulação de job {job_id}")
    print(f"  - {len(job_itens)} frascos para executar")
    print(f"  - Delay por frasco: {frasco_delay_ms}ms")
    print(f"  - Falhas em índices: {fail_frasco_indices}")
    print(f"  - WiFi drop simulado: {simulate_wifi_drop}")
    
    offline_start_time = None
    
    # Executa cada frasco
    for idx, item in enumerate(job_itens):
        frasco = item["frasco"]
        tempero = item["tempero"]
        quantidade_g = item["quantidade_g"]
        
        # Simula WiFi drop antes de começar este frasco
        if simulate_wifi_drop and idx == drop_at_frasco_index:
            print(f"  [OFFLINE] Perdendo WiFi no frasco {frasco}...")
            offline_start_time = time.time()
            await asyncio.sleep(drop_duration_seconds)
            print(f"  [ONLINE] Reconectando após {drop_duration_seconds}s...")
            offline_start_time = None
        
        # Executa frasco (com delay)
        print(f"  [EXEC] Frasco {frasco} ({tempero}, {quantidade_g}g)...", end=" ", flush=True)
        await asyncio.sleep(frasco_delay_ms / 1000.0)
        
        # Determina se falha
        is_failed = idx in fail_frasco_indices
        
        if is_failed:
            print("❌ FALHA (timeout simulado)")
            execution_logs.append({
                "frasco": frasco,
                "tempero": tempero,
                "quantidade_g": quantidade_g,
                "segundos": frasco_delay_ms / 1000.0,
                "status": "failed",
                "error": "Timeout: excedeu 180s",
            })
        else:
            print("✅ OK")
            execution_logs.append({
                "frasco": frasco,
                "tempero": tempero,
                "quantidade_g": quantidade_g,
                "segundos": frasco_delay_ms / 1000.0,
                "status": "done",
                "error": None,
            })
    
    # Conta resultados
    done_count = sum(1 for log in execution_logs if log["status"] == "done")
    failed_count = sum(1 for log in execution_logs if log["status"] == "failed")
    
    print(f"\n[MOCK ESP32] Execução concluída: {done_count} OK, {failed_count} FALHAS")
    
    # Prepara payload para enviar ao backend
    payload = {
        "itens_completados": done_count,
        "itens_falhados": failed_count,
        "execution_logs": execution_logs,
    }
    
    print(f"[MOCK ESP32] Enviando relatório para POST /devices/me/jobs/{job_id}/complete")
    
    # Simula HTTP request (fire-and-forget para este mock)
    # Em produção real, ESP32 faria retry se falhar
    return payload


def mock_esp32_test_endpoint_code() -> str:
    """
    Código para adicionar ao main.py como endpoint de teste.
    
    Exemplo de uso:
      POST /devices/test/simulate-execution
      {
        "job_id": 123,
        "frasco_delay_ms": 1000,
        "fail_frasco_indices": [1],
        "simulate_wifi_drop": false
      }
    """
    return '''
@app.post("/devices/test/simulate-execution")
async def test_simulate_esp32_execution(
    request: dict,  # Sem schema - permite flexibilidade
    db: Session = Depends(get_db),
):
    """
    Endpoint de teste: Simula execução do ESP32 com delays e falhas.
    
    APENAS PARA DESENVOLVIMENTO! Remove em produção.
    """
    from backend.mock_esp32 import simulate_esp32_execution
    
    job_id = request.get("job_id")
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id requerido")
    
    # Busca job
    job = db.query(models.Job).options(selectinload(models.Job.itens)).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    
    if job.status not in ("queued", "running"):
        raise HTTPException(status_code=400, detail=f"Job está em status {job.status}, não pode executar")
    
    # Prepara itens para simulação
    job_items = [
        {
            "frasco": item.frasco,
            "tempero": item.tempero,
            "quantidade_g": item.quantidade_g,
        }
        for item in job.itens
    ]
    
    # Extrai parâmetros
    frasco_delay_ms = request.get("frasco_delay_ms", 2000)
    fail_indices = request.get("fail_frasco_indices", [])
    simulate_wifi = request.get("simulate_wifi_drop", False)
    drop_at = request.get("drop_at_frasco_index", 0)
    drop_duration = request.get("drop_duration_seconds", 5)
    
    # Executa simulação
    payload = await simulate_esp32_execution(
        job_id=job_id,
        job_itens=job_items,
        device_id=1,  # Dummy
        frasco_delay_ms=frasco_delay_ms,
        fail_frasco_indices=fail_indices,
        simulate_wifi_drop=simulate_wifi,
        drop_at_frasco_index=drop_at,
        drop_duration_seconds=drop_duration,
    )
    
    # Para teste, retorna direto o payload simulado
    # Em produção real, o frontend faria POST /devices/me/jobs/{id}/complete
    return {
        "ok": True,
        "simulated_payload": payload,
        "note": "Este é um payload simulado. Em produção real, ESP32 enviaria POST /devices/me/jobs/{id}/complete"
    }
'''
