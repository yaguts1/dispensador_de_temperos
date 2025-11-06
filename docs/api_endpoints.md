# API — Endpoints

> Base: `https://api.yaguts.com.br`  
> Content-Type: `application/json`  
> **Timestamps: UTC (ISO-8601 com offset)**.

Legendas:
- (U) = exige usuário autenticado (cookie)
- (D) = exige dispositivo autenticado (Bearer)

---

## Auth (usuário)

### POST `/auth/register`
Cria usuário.
```json
{ "nome": "alice", "senha": "minhasenha" }
