# 🔍 Troubleshooting: HTTP 404 - Job Completion Report

**Status:** ⏳ DIAGNOSTICAR

---

## 🐛 Problema Identificado

```
[REPORT] ✗ Falha ao reportar: HTTP 404
```

HTTP 404 = **Endpoint not found** no servidor backend

---

## 🔧 Debug Ativado

O código foi modificado para exibir **todos os detalhes da requisição** no Serial Monitor.

### Novo Output Esperado

```
[REPORT] Enviando relatório do job 42 (tentativa)
[REPORT] Completados: 3, Falhados: 0
[REPORT] Payload: {"itens_completados":3,"itens_falhados":0,"execution_logs":[...]}
[REPORT] Payload length: 256 bytes
[REPORT] Endpoint: https://api.yaguts.com.br:443/devices/me/jobs/42/complete
[REPORT] Token presente: SIM
[HTTP POST] https://api.yaguts.com.br:443/devices/me/jobs/42/complete
[HTTP POST] Body: {"itens_completados":3,"itens_falhados":0,"execution_logs":[...]}
[HTTP POST] -> 404 (len=45)
[REPORT] HTTP Status Code: 404
[REPORT] Response Body: {"error":"Resource not found"}
[REPORT] Response Length: 45 bytes
[REPORT] ✗ Falha ao reportar: HTTP 404
```

---

## 🔎 Passos para Diagnosticar

### 1. **Verifique o Endpoint Exato**

Copie a linha:
```
[REPORT] Endpoint: https://api.yaguts.com.br:443/devices/me/jobs/42/complete
```

**Esperado:**
- Host: `api.yaguts.com.br` (ou seu servidor)
- Porta: `443` (HTTPS) ou `80` (HTTP)
- Path: `/devices/me/jobs/{jobId}/complete`
- Token: Deve mostrar `SIM`

### 2. **Verifique o Servidor Backend**

Seu backend (FastAPI) deve ter uma rota assim:

```python
@router.post("/devices/me/jobs/{job_id}/complete")
async def complete_job(job_id: int, payload: dict):
    """Marca um job como completo"""
    return {"status": "ok"}
```

**IMPORTANTE:** A rota DEVE estar sob o router que inclui `/devices/me/`

### 3. **Potenciais Causas do 404**

| Causa | Solução |
|-------|---------|
| Endpoint não existe no backend | Adicionar rota `/devices/me/jobs/{job_id}/complete` |
| Path incorreto (typo no ESP32) | Verificar se path é exatamente `/devices/me/jobs/{job_id}/complete` |
| Rota não registrada no FastAPI | Verificar `app.include_router(device_router, prefix="/devices")` |
| Método HTTP errado (GET em vez de POST) | Código ESP32 usa POST (correto) |
| Token vencido/inválido (retorna 401, não 404) | Se 401: renovar token |

### 4. **Teste o Endpoint via curl**

No seu PC, teste diretamente:

```bash
# Substitua os valores
curl -X POST \
  http://localhost:8000/devices/me/jobs/42/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu_token_aqui" \
  -d '{"itens_completados":3,"itens_falhados":0,"execution_logs":[]}'
```

**Resposta esperada:**
```
HTTP/1.1 200 OK
{"status":"ok"}
```

Se receber 404, o endpoint não existe no backend.

### 5. **Verifique o Código do Backend**

No arquivo `backend/main.py` ou `backend/schemas.py`, procure por:

```python
# Deve existir algo como:
@router.post("/devices/me/jobs/{job_id}/complete")
def mark_job_complete(job_id: int, request: JobCompleteRequest):
    # Processar conclusão do job
    return {"status": "completed"}
```

Se **não existe**, precisa criar!

---

## ✅ Análise Esperada do Serial Output

Após upload do código com debug, você verá:

### Cenário 1: ✅ Sucesso (200)
```
[REPORT] Endpoint: https://api.yaguts.com.br:443/devices/me/jobs/42/complete
[REPORT] Token presente: SIM
[HTTP POST] -> 200 (len=15)
[REPORT] HTTP Status Code: 200
[REPORT] Response Body: {"status":"ok"}
[REPORT] ✓ Relatório enviado com sucesso!
```

### Cenário 2: ❌ Falha 404 (Endpoint não existe)
```
[REPORT] Endpoint: https://api.yaguts.com.br:443/devices/me/jobs/42/complete
[REPORT] Token presente: SIM
[HTTP POST] -> 404 (len=28)
[REPORT] HTTP Status Code: 404
[REPORT] Response Body: {"detail":"Not Found"}
[REPORT] ✗ Falha ao reportar: HTTP 404
```

### Cenário 3: ❌ Falha 401 (Token inválido)
```
[REPORT] Token presente: SIM
[HTTP POST] -> 401 (len=34)
[REPORT] Response Body: {"detail":"Unauthorized"}
```

### Cenário 4: ❌ Falha 500 (Erro servidor)
```
[REPORT] Token presente: SIM
[HTTP POST] -> 500 (len=50)
[REPORT] Response Body: {"detail":"Internal Server Error"}
```

---

## 🛠️ Possível Solução: Criar Endpoint no Backend

Se o endpoint **não existe** no backend, você precisa criar. Adicione a `backend/main.py`:

```python
@app.post("/devices/me/jobs/{job_id}/complete")
async def mark_job_complete(job_id: int, request: dict):
    """
    Recebe relatório de conclusão do job do ESP32.
    Marca job como completo no banco de dados.
    """
    try:
        # Log do recebimento
        print(f"[API] Job {job_id} completion report received")
        print(f"[API] Items completed: {request.get('itens_completados')}")
        print(f"[API] Items failed: {request.get('itens_falhados')}")
        
        # TODO: Atualizar status no banco de dados
        # db.query(Job).filter(Job.id == job_id).update({"status": "completed"})
        # db.commit()
        
        return {"status": "completed", "job_id": job_id}
    except Exception as e:
        return {"error": str(e)}, 500
```

---

## 🔍 Checklist de Diagnóstico

- [ ] Upload do código modificado ao ESP32
- [ ] Abrir Serial Monitor (115200 baud)
- [ ] Executar um job completo
- [ ] Verificar linhas `[REPORT]` no serial
- [ ] **Copiar exatamente:**
  - `[REPORT] Endpoint: ...`
  - `[REPORT] Token presente: ...`
  - `[REPORT] HTTP Status Code: ...`
  - `[REPORT] Response Body: ...`
- [ ] Comparar endpoint com rotas no backend
- [ ] Testar endpoint via curl do PC
- [ ] Se 404: criar endpoint no backend

---

## 📝 Informações para Compartilhar

Quando você compartilhar o problema, inclua:

1. **Serial Output Completo** da tentativa de reportar:
   ```
   [Copiar tudo de [REPORT] até [REPORT] ✗]
   ```

2. **URL Exato do Endpoint:**
   ```
   [Host do servidor]
   [Porta]
   [Path]
   ```

3. **Backend Status:**
   ```
   Qual arquivo contém a rota?
   A rota `/devices/me/jobs/{job_id}/complete` existe?
   ```

4. **Teste curl:** (resultado do teste manual)

---

## 🚀 Próximos Passos

1. **Upload** do código com debug
2. **Reproduzir** a falha 404
3. **Copiar** output do Serial Monitor
4. **Comparar** endpoint com backend routes
5. **Criar endpoint** se não existir
6. **Testar** novamente

---

**Adicione este arquivo ao projeto para referência futura!**
