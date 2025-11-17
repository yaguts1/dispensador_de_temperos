#!/usr/bin/env python3
"""
Script para executar migrations SQL no banco de dados.
Uso: python run_migrations.py
"""
import sqlite3
import os
from pathlib import Path

DB_PATH = "dispenser.db"
MIGRATIONS_DIR = "migrations"

def run_migrations():
    """Executa todos os arquivos .sql na pasta migrations em ordem."""
    if not os.path.exists(DB_PATH):
        print(f"❌ Banco de dados '{DB_PATH}' não encontrado!")
        return False
    
    migrations_path = Path(MIGRATIONS_DIR)
    if not migrations_path.exists():
        print(f"❌ Pasta '{MIGRATIONS_DIR}' não encontrada!")
        return False
    
    # Lista todos os arquivos .sql ordenados
    sql_files = sorted(migrations_path.glob("*.sql"))
    
    if not sql_files:
        print(f"⚠️ Nenhum arquivo .sql encontrado em '{MIGRATIONS_DIR}'")
        return True
    
    print(f"📁 Banco de dados: {DB_PATH}")
    print(f"📂 Migrations encontradas: {len(sql_files)}")
    print()
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    success_count = 0
    error_count = 0
    
    for sql_file in sql_files:
        print(f"🔄 Executando: {sql_file.name}...", end=" ")
        
        try:
            with open(sql_file, 'r', encoding='utf-8') as f:
                sql = f.read()
            
            cursor.executescript(sql)
            conn.commit()
            print("✅ OK")
            success_count += 1
            
        except sqlite3.Error as e:
            print(f"❌ ERRO: {e}")
            error_count += 1
            # Continua executando outras migrations mesmo com erro
    
    conn.close()
    
    print()
    print(f"✅ Migrations executadas com sucesso: {success_count}")
    if error_count > 0:
        print(f"❌ Migrations com erro: {error_count}")
    
    return error_count == 0

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 Executando Migrations")
    print("=" * 60)
    print()
    
    success = run_migrations()
    
    print()
    print("=" * 60)
    if success:
        print("✨ Todas as migrations foram aplicadas com sucesso!")
    else:
        print("⚠️ Algumas migrations falharam. Verifique os erros acima.")
    print("=" * 60)
