# Arquitetura

## Componentes

- **FastAPI (Python)**
  - Camadas:
    - **Auth (usuário):** JWT em cookie `access_token`. Cookies parametrizados por `COOKIE_DOMAIN`, `COOKIE_SECURE`, `SameSite=Lax`.
    - **Auth (dispositivo):** JWT do tipo `device`, enviado em `Authorization: Bearer <token>`.
    - **Receitas:** CRUD por usuário.
    - **Config. Robô:** Rótulos e calibração (g/s) dos frascos 1..4; estoque estimado.
    - **Jobs:** fila de execução *por usuário* (no máximo 1 job ativo — `queued`/`running`).
    - **Dispositivos:** claim (vínculo via código de 6 dígitos), heartbeat e polling.
  - Persistência via SQLAlchemy (models sob `app.models`). O `on_startup` faz `create_all`.

- **ESP32 (firmware)**
  - Página de config sempre disponível (STA) e portal cativo opcional (AP + DNS).
  - Fluxo: Wi-Fi → Claim (se necessário) → Heartbeat periódico → Polling de `/devices/me/next_job`.
  - Robusteza HTTP: timeouts, `Connection: close`, sem keep-alive, reconexão Wi-Fi em falhas.

## Fluxos Principais

### 1) Vínculo do Dispositivo (Claim)
1. Usuário logado chama `POST /devices/claims` e recebe `code` (expira em ~10 min).
2. ESP32, pela página de config, salva SSID/senha/`claim_code` e reinicia.
3. ESP32 `POST /devices/claim` { uid, claim_code, fw_version, mac }  
   → API devolve `{ device_token, heartbeat_sec }`.
4. ESP32 passa a enviar `Authorization: Bearer <device_token>` nas rotas `/devices/me/*`.

### 2) Execução de um Job
1. Usuário cria job via `POST /jobs` (valida mapeamento/calibração/estoque).
2. ESP32 poll `GET /devices/me/next_job` → recebe job e marca como `running`.
3. ESP32 executa os itens (R1..R4 por `segundos`) e `POST .../status` = `done`.
4. API **abate o estoque** na conclusão do job (`/status` = `done`).

### 3) Online/Offline
- `last_seen` é atualizado no `POST /devices/me/heartbeat`.  
- Um device é considerado **online** se `now - last_seen <= 90s`.

## Estados & Timestamps

- Status de Job: `queued` → `running` → `done` | `failed`.
- Timestamps (`created_at`, `started_at`, `finished_at`, `expires_at`) **sempre em UTC** (timezone-aware).
- O front deve renderizar em localtime do usuário.

## Regras/Negócios

- **Um job por vez por usuário** (bloqueio em `POST /jobs`).
- **Mapeamento obrigatório**: rótulos dos frascos devem bater com nomes dos ingredientes (case-insensitive).
- **Calibração obrigatória**: `g_por_seg > 0` para cada frasco usado na receita.
- **Estoque**: se informado, bloqueia job com consumo maior que disponível; **abatido** somente quando o device conclui (`/status done`).

