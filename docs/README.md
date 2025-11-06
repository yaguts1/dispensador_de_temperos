# Dispenser de Temperos — Documentação

Este diretório contém a documentação do projeto **Yaguts Dispenser** (API + firmware ESP32).

## Índice

- [Visão Geral](#visão-geral)
- [Arquitetura](./arquitetura.md)
- [Endpoints da API](./api_endpoints.md)
- [Protocolo do Dispositivo (ESP32)](./device_protocol.md)
- [Notas do Firmware (ESP32)](./firmware_notes.md)
- [Operação / Deploy / Variáveis de Ambiente](./ops.md)
- [Troubleshooting](./troubleshooting.md)

## Visão Geral

- **API (FastAPI)**  
  Gerencia usuários, receitas, configuração dos reservatórios, fila de jobs e vínculo de dispositivos.  
  Autenticação de **usuário** via cookie (JWT em `access_token`). Autenticação de **dispositivo** via **Bearer** (JWT de tipo `device`).

- **Firmware (ESP32)**  
  Faz *claim* (vínculo) via código de 6 dígitos, dá *heartbeat*, realiza *polling* de novos jobs, executa e reporta o status.  
  Possui **página de configuração** via STA (`http://<ip-do-esp>/`) e **portal cativo** em AP quando necessário.

- **Tempo & Fuso**  
  **Toda a API retorna/aceita timestamps em UTC** (ISO-8601 com offset). O front-end deve formatar para horário local do usuário.
