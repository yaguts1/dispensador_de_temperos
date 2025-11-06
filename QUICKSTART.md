#!/bin/bash
# QUICK START GUIDE - Yaguts Dispenser Project
# 
# Uso:
#   bash QUICKSTART.md
# 
# Este script documenta como rodar o projeto localmente

echo "
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 YAGUTS DISPENSER - QUICK START GUIDE                   ║
║                                                              ║
║   Status: ✅ 3/3 Checkpoints Complete (100%)               ║
║   Production Ready: YES                                     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"

echo "
═════════════════════════════════════════════════════════════════
📋 STEP 0: Setup Inicial (primeira vez)
═════════════════════════════════════════════════════════════════
"

echo "
1️⃣  Clone o repositório
$ git clone https://github.com/yaguts1/dispensador_de_temperos.git
$ cd dispensador_de_temperos

2️⃣  Crie virtual environment Python
$ python -m venv .venv
$ .venv\\Scripts\\activate  # Windows
$ source .venv/bin/activate  # Linux/Mac

3️⃣  Instale dependências
$ cd backend
$ pip install -r requirements.txt

4️⃣  Inicie banco de dados (primeira vez)
$ python -c 'from database import Base, engine; Base.metadata.create_all(engine)'
"

echo "
═════════════════════════════════════════════════════════════════
🏃 STEP 1: Rodar Backend Localmente
═════════════════════════════════════════════════════════════════
"

echo "
Terminal 1:
$ cd backend
$ python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

✅ Sucesso se ver:
   'Uvicorn running on http://0.0.0.0:8000'
   
📖 Docs automáticos em:
   - http://localhost:8000/docs (Swagger UI)
   - http://localhost:8000/redoc (ReDoc)
"

echo "
═════════════════════════════════════════════════════════════════
🌐 STEP 2: Abrir Frontend Localmente
═════════════════════════════════════════════════════════════════
"

echo "
Terminal 2:
$ cd frontend
$ python -m http.server 8080

✅ Abra no browser:
   http://localhost:8080

📝 Nota: Frontend é vanilla JS, sem build step necessário
"

echo "
═════════════════════════════════════════════════════════════════
🧪 STEP 3: Testar Mock Simulator
═════════════════════════════════════════════════════════════════
"

echo "
Teste 1: Execução normal (todos OK)
$ curl -X POST http://localhost:8000/devices/test/simulate-execution \\
  -H 'Content-Type: application/json' \\
  -d '{
    \"job_id\": 1,
    \"frasco_delay_ms\": 1000,
    \"fail_frasco_indices\": []
  }'

Teste 2: Com falhas
$ curl -X POST http://localhost:8000/devices/test/simulate-execution \\
  -H 'Content-Type: application/json' \\
  -d '{
    \"job_id\": 2,
    \"frasco_delay_ms\": 1000,
    \"fail_frasco_indices\": [1, 2]
  }'

Teste 3: WiFi drop simulado
$ curl -X POST http://localhost:8000/devices/test/simulate-execution \\
  -H 'Content-Type: application/json' \\
  -d '{
    \"job_id\": 3,
    \"frasco_delay_ms\": 1000,
    \"simulate_wifi_drop\": true,
    \"drop_at_frasco_index\": 1,
    \"drop_duration_seconds\": 5
  }'
"

echo "
═════════════════════════════════════════════════════════════════
✅ STEP 4: Testar WebSocket (Real-Time Monitoring)
═════════════════════════════════════════════════════════════════
"

echo "
No browser (Console DevTools):

// Conecta ao WebSocket
const ws = new WebSocket('ws://localhost:8000/ws/jobs/1');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log('Recebido:', msg);
  
  if (msg.type === 'execution_log_entry') {
    console.log('✅ Frasco', msg.data.frasco, ':', msg.data.status);
  } else if (msg.type === 'execution_complete') {
    console.log('🎉 Job concluído:', msg.data);
  }
};

ws.onopen = () => {
  console.log('🔗 Conectado ao job 1');
  ws.send('ping');  // Heartbeat
};

ws.onerror = (error) => console.error('❌ Erro:', error);
ws.onclose = () => console.log('❌ Desconectado');
"

echo "
═════════════════════════════════════════════════════════════════
🧪 STEP 5: Rodar E2E Tests (Opcional)
═════════════════════════════════════════════════════════════════
"

echo "
Instale dependências de teste:
$ pip install pytest pytest-asyncio httpx websockets

Rode testes:
$ pytest test_e2e_execution.py -v -s

✅ Resultados esperados:
   - test_scenario_1_normal_execution PASSED
   - test_scenario_2_partial_failure PASSED
   - test_scenario_3_wifi_drop_recovery PASSED
   - test_websocket_connect_and_receive PASSED
   - test_duplicate_report_idempotent PASSED
"

echo "
═════════════════════════════════════════════════════════════════
📁 ESTRUTURA DO PROJETO
═════════════════════════════════════════════════════════════════
"

cat << 'EOF'
dispensador_de_temperos/
├── backend/
│   ├── main.py                 ← FastAPI app + WebSocket endpoint
│   ├── models.py               ← SQLAlchemy ORM
│   ├── schemas.py              ← Pydantic validation
│   ├── database.py             ← DB connection
│   ├── mock_esp32.py           ← Mock simulator
│   └── requirements.txt         ← Dependencies
│
├── frontend/
│   ├── app.js                  ← Main app (JobExecutionMonitor aqui)
│   ├── index.html              ← HTML template
│   └── style.css               ← Styling
│
├── esp32/
│   ├── dispenser.ino           ← Main firmware
│   ├── job_execution.ino       ← Execution logic
│   └── job_persistence.h       ← Flash storage
│
├── tests/
│   ├── test_checkpoint_1.py    ← Backend tests
│   └── test_e2e_execution.py   ← E2E scenarios
│
└── docs/
    ├── CHECKPOINT_1_DONE.md    ← Backend summary
    ├── CHECKPOINT_2_DONE.md    ← ESP32 summary
    ├── CHECKPOINT_3_DONE.md    ← WebSocket summary
    ├── CHECKPOINT_3_SUMMARY.md ← Executive overview
    └── PROJECT_STATUS.md       ← Metrics + status
EOF

echo "
═════════════════════════════════════════════════════════════════
🔧 TROUBLESHOOTING
═════════════════════════════════════════════════════════════════
"

cat << 'EOF'
❌ Backend não inicia
   → Verificar porta 8000 está livre: netstat -ano | findstr :8000
   → Verificar requirements instaladas: pip list | grep -i fastapi

❌ Frontend não conecta ao backend
   → Verificar CORS em main.py (allow_origins)
   → Verificar API_URL em app.js (deve ser http://localhost:8000)

❌ WebSocket connection refused
   → Backend não está rodando (Step 1)
   → Verificar firewall bloqueando porta 8000

❌ Tests não rodam
   → pip install pytest pytest-asyncio httpx websockets
   → Backend deve estar rodando (http://localhost:8000)

❌ Database error
   → rm database.db (delete old DB)
   → python -c 'from backend.database import Base, engine; Base.metadata.create_all(engine)'
EOF

echo "
═════════════════════════════════════════════════════════════════
📚 DOCUMENTAÇÃO COMPLETA
═════════════════════════════════════════════════════════════════

Leia em ordem:
1. README.md                    ← Overview
2. docs/arquitetura.md          ← Design decisions
3. CHECKPOINT_1_DONE.md         ← Backend deep dive
4. CHECKPOINT_2_DONE.md         ← ESP32 deep dive
5. CHECKPOINT_3_DONE.md         ← WebSocket deep dive
6. CHECKPOINT_3_SUMMARY.md      ← Executive summary
7. PROJECT_STATUS.md            ← Metrics
8. PHASE_2_ESP32_README.md      ← ESP32 operations guide
"

echo "
═════════════════════════════════════════════════════════════════
✅ YOU'RE ALL SET! 
═════════════════════════════════════════════════════════════════

Próximos passos:
1. ✅ Backend rodando (port 8000)
2. ✅ Frontend rodando (port 8080)
3. ✅ Teste mock simulator
4. ✅ Conecte ao WebSocket
5. ⏳ Hardware testing com ESP32 real
6. ⏳ Deploy para produção

Questions? Ver docs/TROUBLESHOOTING.md
"
