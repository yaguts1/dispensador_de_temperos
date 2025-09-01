# Dispenser Automático de Temperos 🍲

Projeto acadêmico para desenvolvimento de um dispensador automático de temperos
com integração entre **ESP32 + FastAPI + Banco de Dados + Frontend Web**.

## 🚀 Tecnologias
- ESP32 (Arduino IDE)
- Python (FastAPI, SQLite/Postgres, Pydantic, SQLAlchemy)
- Frontend Web (HTML, JS)
- GitHub Actions (CI/CD)

## 📌 Funcionalidades
- Login de usuários
- Configuração de 4 frascos de temperos
- Cadastro de receitas personalizadas
- Execução de receitas via API → comando ao ESP32
- Histórico de uso por usuário

## 📂 Estrutura do Projeto
- `backend/` → API em FastAPI
- `esp32/` → código do microcontrolador
- `frontend/` → interface web
- `docs/` → documentação

## 🛠️ Como rodar localmente
```bash
git clone https://github.com/seu-usuario/dispenser-temperos.git
cd dispenser-temperos/backend
pip install -r requirements.txt
uvicorn main:app --reload
