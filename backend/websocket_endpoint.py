"""
Endpoint WebSocket para monitorar execução de jobs em tempo real.
Separado em arquivo próprio para clareza.

Uso frontend:
  const ws = new WebSocket('ws://localhost:8000/ws/jobs/123')
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.type === 'execution_log_entry') {
      // {frasco: 1, status: "done"|"failed", ms: 5200, error: null}
      updateProgressBar(msg.data)
    } else if (msg.type === 'execution_complete') {
      // {ok: true, stock_deducted: true, itens_completados: 3, itens_falhados: 1}
      showCompletionDialog(msg.data)
    }
  }
"""

from fastapi import WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

async def websocket_monitor_job(
    websocket: WebSocket,
    job_id: int,
    job_exec_manager,  # Injetado
    db: Session,
    device_user_id: Optional[int] = None,
):
    """
    WebSocket endpoint: GET /ws/jobs/{job_id}
    
    Permite ao frontend conectar e receber updates de execução em tempo real.
    Envia:
    - { type: "execution_log_entry", data: {...}, timestamp: "..." }
    - { type: "execution_complete", data: {...}, timestamp: "..." }
    """
    from . import models
    
    # Valida que o job existe e pertence ao usuário
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        await websocket.close(code=4004, reason="Job not found")
        return
    
    # Se device_user_id foi passado (verificação via token), valida propriedade
    if device_user_id:
        dono_id = job.receita.dono_id if job.receita else job.user_id
        if dono_id != device_user_id:
            await websocket.close(code=4003, reason="Job not owned by this user")
            return
    
    # Conecta ao manager
    await job_exec_manager.connect(job_id, websocket)
    
    try:
        # Mantém conexão aberta, aguardando mensagens (keep-alive)
        while True:
            # Aguarda pong/heartbeat do cliente ou finalização
            data = await websocket.receive_text()
            # Se receber algo, pode ser um ping/heartbeat, ignora
            if data and data.strip().lower() == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await job_exec_manager.disconnect(job_id, websocket)
    except Exception as e:
        print(f"[WS ERROR] job {job_id}: {e}")
        await job_exec_manager.disconnect(job_id, websocket)
