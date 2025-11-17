"""
Script de teste para validar atualização do campo porcoes
"""
import requests

API_URL = "https://api.yaguts.com.br"

# Credenciais (substitua pelas suas)
LOGIN = {
    "nome": "seu_usuario",
    "senha": "sua_senha"
}

def test_porcoes_update():
    session = requests.Session()
    
    # 1. Login
    print("1. Fazendo login...")
    r = session.post(f"{API_URL}/auth/login", json=LOGIN)
    if r.status_code != 200:
        print(f"❌ Erro no login: {r.status_code} - {r.text}")
        return
    print("✅ Login OK")
    
    # 2. Criar receita com porcoes=4
    print("\n2. Criando receita para 4 pessoas...")
    receita_data = {
        "nome": "Teste Porcoes",
        "porcoes": 4,
        "ingredientes": [
            {"tempero": "Sal", "quantidade": 10}
        ]
    }
    r = session.post(f"{API_URL}/receitas/", json=receita_data)
    if r.status_code != 201:
        print(f"❌ Erro ao criar: {r.status_code} - {r.text}")
        return
    
    receita = r.json()
    receita_id = receita["id"]
    print(f"✅ Receita criada: ID={receita_id}")
    print(f"   porcoes no response: {receita.get('porcoes')}")
    
    # 3. Buscar receita (GET)
    print(f"\n3. Buscando receita #{receita_id}...")
    r = session.get(f"{API_URL}/receitas/{receita_id}")
    receita = r.json()
    print(f"   porcoes no GET: {receita.get('porcoes')}")
    
    if receita.get("porcoes") != 4:
        print(f"❌ ERRO: Expected porcoes=4, got {receita.get('porcoes')}")
    else:
        print("✅ Porção salva corretamente!")
    
    # 4. Atualizar para 6 pessoas
    print(f"\n4. Atualizando para 6 pessoas...")
    update_data = {
        "nome": "Teste Porcoes (atualizado)",
        "porcoes": 6,
        "ingredientes": [
            {"tempero": "Sal", "quantidade": 15}
        ]
    }
    r = session.put(f"{API_URL}/receitas/{receita_id}", json=update_data)
    if r.status_code != 200:
        print(f"❌ Erro ao atualizar: {r.status_code} - {r.text}")
        return
    
    receita = r.json()
    print(f"✅ Receita atualizada")
    print(f"   porcoes no response: {receita.get('porcoes')}")
    
    # 5. Buscar novamente
    print(f"\n5. Buscando receita atualizada...")
    r = session.get(f"{API_URL}/receitas/{receita_id}")
    receita = r.json()
    print(f"   porcoes no GET: {receita.get('porcoes')}")
    
    if receita.get("porcoes") != 6:
        print(f"❌ ERRO: Expected porcoes=6, got {receita.get('porcoes')}")
    else:
        print("✅ Atualização OK!")
    
    # 6. Limpar (deletar receita de teste)
    print(f"\n6. Limpando receita de teste...")
    r = session.delete(f"{API_URL}/receitas/{receita_id}")
    print("✅ Receita deletada")

if __name__ == "__main__":
    print("=" * 60)
    print("TESTE: Atualização do campo porcoes")
    print("=" * 60)
    test_porcoes_update()
    print("\n" + "=" * 60)
