#!/usr/bin/env python
"""
Script de Migração de Banco de Dados
Atualiza schema do banco antigo para o novo (com colunas de offline-first)
"""

import os
import sqlite3
import shutil
from datetime import datetime

DB_PATH = "dispenser.db"
BACKUP_PATH = f"dispenser.db.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"

def backup_database():
    """Faz backup do banco de dados antes de migrar"""
    if os.path.exists(DB_PATH):
        shutil.copy2(DB_PATH, BACKUP_PATH)
        print(f"✅ Backup criado: {BACKUP_PATH}")
        return True
    return False

def migrate_jobs_table():
    """Adiciona colunas faltantes na tabela jobs"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Verifica se coluna já existe
        cursor.execute("PRAGMA table_info(jobs)")
        columns = [col[1] for col in cursor.fetchall()]
        
        print(f"Colunas atuais em 'jobs': {columns}")
        
        # Adiciona colunas faltantes
        if 'itens_completados' not in columns:
            print("Adicionando coluna 'itens_completados'...")
            cursor.execute("ALTER TABLE jobs ADD COLUMN itens_completados INTEGER DEFAULT NULL")
            print("✅ Coluna 'itens_completados' adicionada")
        
        if 'itens_falhados' not in columns:
            print("Adicionando coluna 'itens_falhados'...")
            cursor.execute("ALTER TABLE jobs ADD COLUMN itens_falhados INTEGER DEFAULT NULL")
            print("✅ Coluna 'itens_falhados' adicionada")
        
        if 'execution_report' not in columns:
            print("Adicionando coluna 'execution_report'...")
            cursor.execute("ALTER TABLE jobs ADD COLUMN execution_report TEXT DEFAULT NULL")
            print("✅ Coluna 'execution_report' adicionada")
        
        conn.commit()
        print("\n✅ Migração concluída com sucesso!")
        return True
        
    except sqlite3.Error as e:
        print(f"❌ Erro durante migração: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def check_database():
    """Verifica o estado atual do banco"""
    if not os.path.exists(DB_PATH):
        print(f"⚠️  Banco de dados não encontrado: {DB_PATH}")
        return False
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        print(f"📊 Tabelas encontradas: {[t[0] for t in tables]}")
        
        if tables:
            cursor.execute("PRAGMA table_info(jobs)")
            columns = cursor.fetchall()
            print(f"\n📋 Schema da tabela 'jobs':")
            for col in columns:
                print(f"   - {col[1]} ({col[2]})")
        
        return True
        
    except sqlite3.Error as e:
        print(f"❌ Erro ao verificar banco: {e}")
        return False
    finally:
        conn.close()

def delete_and_recreate():
    """Opção nuclear: deleta banco antigo e deixa o código criar novo"""
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print(f"✅ Banco de dados deletado: {DB_PATH}")
        print("⚠️  Todos os dados foram perdidos!")
        print("✅ Execute o backend novamente para criar novo banco")
        return True
    return False

if __name__ == "__main__":
    print("=" * 60)
    print("🔧 MIGRAÇÃO DE BANCO DE DADOS - YAGUTS DISPENSER")
    print("=" * 60)
    
    # 1. Verificar estado atual
    print("\n1️⃣  Verificando banco de dados...")
    if not check_database():
        print("Abortando migração.")
        exit(1)
    
    # 2. Opções
    print("\n2️⃣  Escolha uma opção:")
    print("   [1] Fazer backup e migrar (recomendado)")
    print("   [2] Deletar e recriar banco (todos os dados serão perdidos)")
    print("   [3] Sair sem fazer nada")
    
    choice = input("\nOpção (1-3): ").strip()
    
    if choice == "1":
        print("\n🔄 Iniciando migração...")
        if backup_database():
            if migrate_jobs_table():
                print("\n✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!")
                print(f"   Backup salvo em: {BACKUP_PATH}")
                print("   Execute o backend e teste a aplicação")
            else:
                print("\n❌ Erro na migração. Backup mantido.")
        else:
            print("⚠️  Nenhum banco encontrado para fazer backup")
    
    elif choice == "2":
        confirm = input("\n⚠️  CONFIRMAR: Deletar banco de dados? (s/N): ").strip().lower()
        if confirm == 's':
            if backup_database():
                delete_and_recreate()
                print("\n✅ BANCO DELETADO!")
                print("   Execute 'python -m uvicorn backend.main:app --reload'")
            else:
                print("⚠️  Nenhum banco encontrado")
        else:
            print("Operação cancelada")
    
    elif choice == "3":
        print("Saindo sem alterações")
    
    else:
        print("❌ Opção inválida")
