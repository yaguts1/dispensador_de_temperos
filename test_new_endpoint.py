#!/usr/bin/env python
"""Teste rápido do novo endpoint device_job_complete"""

import json
from backend.schemas import JobCompleteIn, ExecutionLogEntry, JobCompleteOut

# Teste 1: Criar schema de entrada
print("✓ Teste 1: Criar schema JobCompleteIn")
logs = [
    ExecutionLogEntry(
        frasco=1,
        tempero="Sal",
        quantidade_g=10.0,
        segundos=5.0,
        status="done"
    ),
    ExecutionLogEntry(
        frasco=2,
        tempero="Pimenta",
        quantidade_g=2.0,
        segundos=1.0,
        status="done"
    )
]

payload = JobCompleteIn(
    itens_completados=2,
    itens_falhados=0,
    execution_logs=logs
)

print(f"  Payload criado: {payload.itens_completados} concluídos, {payload.itens_falhados} falhados")
print(f"  Logs: {len(payload.execution_logs)} itens")

# Teste 2: Serializar para JSON
print("\n✓ Teste 2: Serializar para JSON")
payload_json = json.dumps(payload.model_dump(), indent=2)
print(f"  JSON:\n{payload_json}")

# Teste 3: Criar schema de saída
print("\n✓ Teste 3: Criar schema JobCompleteOut")
response = JobCompleteOut(
    ok=True,
    stock_deducted=True,
    message="Job completado com sucesso"
)
print(f"  Response: {response}")

print("\n✅ Todos os testes de schema passaram!")
