#!/usr/bin/env python3
"""
Script para verificar se as colunas porcoes e pessoas_solicitadas existem no banco
"""
import sqlite3
import sys

DB_PATH = "dispenser.db"

def check_schema():
    print("=" * 60)
    print("  VERIFICAÇÃO DE SCHEMA")
    print("=" * 60)
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Verifica receitas
        print("\n📋 Tabela: receitas")
        cursor.execute("PRAGMA table_info(receitas)")
        receitas_cols = cursor.fetchall()
        
        print("Colunas encontradas:")
        for col in receitas_cols:
            print(f"  - {col[1]} ({col[2]})")
        
        has_porcoes = any(col[1] == 'porcoes' for col in receitas_cols)
        if has_porcoes:
            print("✅ Coluna 'porcoes' existe")
        else:
            print("❌ Coluna 'porcoes' NÃO existe!")
        
        # Verifica jobs
        print("\n📋 Tabela: jobs")
        cursor.execute("PRAGMA table_info(jobs)")
        jobs_cols = cursor.fetchall()
        
        print("Colunas encontradas:")
        for col in jobs_cols:
            print(f"  - {col[1]} ({col[2]})")
        
        has_pessoas = any(col[1] == 'pessoas_solicitadas' for col in jobs_cols)
        if has_pessoas:
            print("✅ Coluna 'pessoas_solicitadas' existe")
        else:
            print("❌ Coluna 'pessoas_solicitadas' NÃO existe!")
        
        # Testa uma receita existente
        print("\n📊 Testando receitas existentes:")
        cursor.execute("SELECT id, nome, porcoes FROM receitas LIMIT 3")
        receitas = cursor.fetchall()
        
        if receitas:
            for r in receitas:
                print(f"  ID={r[0]}, nome={r[1]}, porcoes={r[2]}")
        else:
            print("  (nenhuma receita encontrada)")
        
        conn.close()
        
        print("\n" + "=" * 60)
        
        if not has_porcoes:
            print("❌ ERRO: Você precisa executar migrate_db.py!")
            print("   Execute: python3 migrate_db.py")
            return False
        
        return True
        
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        return False

if __name__ == "__main__":
    success = check_schema()
    sys.exit(0 if success else 1)
