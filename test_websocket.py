#!/usr/bin/env python3
"""
Script para testar WebSocket localmente
"""
import asyncio
import websockets
import json
import sqlite3

def get_valid_job_id():
    """Pega um job válido do banco de dados"""
    try:
        conn = sqlite3.connect('dispenser.db')
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM jobs ORDER BY id DESC LIMIT 1")
        result = cursor.fetchone()
        conn.close()
        return result[0] if result else None
    except Exception as e:
        print(f"⚠️  Não conseguiu acessar banco: {e}")
        return None

async def test_websocket_with_job(job_id):
    uri = f"ws://localhost:8000/ws/jobs/{job_id}"
    
    print(f"🔌 Tentando conectar em: {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Conexão WebSocket estabelecida!")
            
            # Envia ping
            await websocket.send("ping")
            print("📤 Ping enviado")
            
            # Aguarda resposta com timeout
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📥 Resposta recebida: {response}")
                
                # Tenta parsear JSON
                try:
                    data = json.loads(response)
                    print(f"   Tipo: {data.get('type')}")
                except:
                    print(f"   Texto: {response}")
                    
            except asyncio.TimeoutError:
                print("⏰ Timeout esperando resposta (normal se sem eventos)")
            
            # Mantém conexão por 5 segundos
            print("⏳ Mantendo conexão por 5 segundos...")
            await asyncio.sleep(5)
            
            print("✅ Teste concluído com sucesso!")
            
    except websockets.exceptions.InvalidStatusCode as e:
        print(f"❌ Erro de status HTTP: {e.status_code}")
        if hasattr(e, 'headers'):
            print(f"   Headers: {e.headers}")
    except websockets.exceptions.ConnectionClosedError as e:
        print(f"⚠️  Conexão fechada pelo servidor: code={e.code}, reason={e.reason}")
        if e.code == 4004:
            print("   → Job não encontrado no banco de dados")
        elif e.code == 4003:
            print("   → Job não pertence ao usuário")
    except ConnectionRefusedError:
        print("❌ Conexão recusada - servidor não está rodando?")
    except Exception as e:
        print(f"❌ Erro: {type(e).__name__}: {e}")

async def test_nonexistent_job():
    """Testa com job inexistente (deve retornar 4004)"""
    uri = "ws://localhost:8000/ws/jobs/999999"
    print(f"\n🔌 Testando job inexistente: {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Conexão aceita")
            # Aguarda close
            try:
                await websocket.recv()
            except websockets.exceptions.ConnectionClosedError as e:
                if e.code == 4004:
                    print("✅ Recebeu erro esperado: 4004 Job not found")
                else:
                    print(f"⚠️  Código inesperado: {e.code}")
    except Exception as e:
        print(f"❌ Erro: {type(e).__name__}: {e}")

if __name__ == "__main__":
    print("=== Teste de WebSocket ===\n")
    
    # Teste 1: Job válido
    job_id = get_valid_job_id()
    if job_id:
        print(f"📋 Job encontrado no banco: {job_id}\n")
        asyncio.run(test_websocket_with_job(job_id))
    else:
        print("⚠️  Nenhum job encontrado, testando com ID=1")
        asyncio.run(test_websocket_with_job(1))
    
    # Teste 2: Job inexistente
    asyncio.run(test_nonexistent_job())
