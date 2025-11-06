# Troubleshooting

## Painel diz “Nenhum robô online”
- Verifique `GET /me/devices`: `last_seen` e `online`.
- O ESP32 deve enviar `POST /devices/me/heartbeat` a cada ~30s (valor negociado no claim).
- **Token inválido (401)** no heartbeat → o device deve apagar o token (NVS) e refazer claim.

## Poll não retorna próximo job
- Se o job anterior ainda está `running`, espere o `done` (ou cancele com `POST /jobs/active/cancel`).
- `GET /devices/me/next_job` responde **204** quando não há fila.
- Confira se há **apenas um** job `queued/running` por usuário (regra de negócio).

## “500 em /devices”
- Use o endpoint correto do painel: `GET /me/devices` (há também alias `GET /devices`).
- Erros costumam vir de dados de data/hora inválidos; versão atual normaliza tudo para UTC.

## Reset/reboots no ESP32
- Sintoma: `assert failed: xQueueSemaphoreTake queue.c:1709`.
- Causa: `WebServer.begin()` antes do Wi-Fi estar ativo.
- Solução: iniciar o `WebServer` **somente depois** de `STA` ou `AP` estar ligado (já aplicado no firmware).

## Mapas/Calibração/Estoque
- **409 Mapeamento ausente**: configure rótulos em **Robô**.
- **409 Calibração pendente**: informe `g_por_seg` > 0.
- **409 Estoque insuficiente**: ajuste `estoque_g` ou reduza o multiplicador.

## Tempo errado na UI
- A API devolve UTC; o front deve converter para local do usuário (ex.: `new Date(iso).toLocaleString()`).
