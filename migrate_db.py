#!/usr/bin/env python3
"""
Script de migração para adicionar colunas porcoes e pessoas_solicitadas
Uso: python migrate_db.py
"""
import os
import sys
import shutil
from pathlib import Path
from datetime import datetime

# Adiciona o diretório pai ao path para importar módulos do backend
sys.path.insert(0, str(Path(__file__).parent))

try:
    from sqlalchemy import text
    from backend.database import engine
    HAS_SQLALCHEMY = True
except ImportError:
    HAS_SQLALCHEMY = False
    import sqlite3

DB_PATH = "dispenser.db"
BACKUP_PATH = f"dispenser.db.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"

def backup_database():
    """Faz backup do banco de dados antes de migrar"""
    if os.path.exists(DB_PATH):
        shutil.copy2(DB_PATH, BACKUP_PATH)
        print(f"✅ Backup criado: {BACKUP_PATH}")
        return True
    return False

def run_migration_sqlalchemy():
    """Executa migration usando SQLAlchemy (PostgreSQL/SQLite)"""
    migration_sql = """
    -- Adicionar coluna porcoes na tabela receitas
    ALTER TABLE receitas 
    ADD COLUMN IF NOT EXISTS porcoes INTEGER NOT NULL DEFAULT 1;
    
    -- Adicionar coluna pessoas_solicitadas na tabela jobs
    ALTER TABLE jobs 
    ADD COLUMN IF NOT EXISTS pessoas_solicitadas INTEGER NOT NULL DEFAULT 1;
    
    -- Migrar dados existentes
    UPDATE jobs 
    SET pessoas_solicitadas = multiplicador 
    WHERE pessoas_solicitadas = 1 AND multiplicador > 1;
    """
    
    try:
        with engine.connect() as conn:
            statements = [s.strip() for s in migration_sql.split(';') if s.strip() and not s.strip().startswith('--')]
            
            for stmt in statements:
                if stmt:
                    print(f"  Executando: {stmt[:60]}...")
                    conn.execute(text(stmt))
                    conn.commit()
        
        print("✅ Migration executada com sucesso!")
        return True
    except Exception as e:
        print(f"❌ Erro ao executar migration: {e}")
        return False

def run_migration_sqlite():
    """Executa migration usando sqlite3 direto"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Verifica colunas existentes
        cursor.execute("PRAGMA table_info(receitas)")
        receitas_cols = [col[1] for col in cursor.fetchall()]
        
        cursor.execute("PRAGMA table_info(jobs)")
        jobs_cols = [col[1] for col in cursor.fetchall()]
        
        # Adiciona porcoes se não existir
        if 'porcoes' not in receitas_cols:
            print("  Adicionando coluna 'porcoes' em receitas...")
            cursor.execute("ALTER TABLE receitas ADD COLUMN porcoes INTEGER NOT NULL DEFAULT 1")
            print("✅ Coluna 'porcoes' adicionada")
        else:
            print("⚠️  Coluna 'porcoes' já existe")
        
        # Adiciona pessoas_solicitadas se não existir
        if 'pessoas_solicitadas' not in jobs_cols:
            print("  Adicionando coluna 'pessoas_solicitadas' em jobs...")
            cursor.execute("ALTER TABLE jobs ADD COLUMN pessoas_solicitadas INTEGER NOT NULL DEFAULT 1")
            print("✅ Coluna 'pessoas_solicitadas' adicionada")
        else:
            print("⚠️  Coluna 'pessoas_solicitadas' já existe")
        
        # Migra dados
        print("  Migrando dados: multiplicador → pessoas_solicitadas...")
        cursor.execute("""
            UPDATE jobs 
            SET pessoas_solicitadas = multiplicador 
            WHERE pessoas_solicitadas = 1 AND multiplicador > 1
        """)
        
        conn.commit()
        print("✅ Migration SQLite concluída com sucesso!")
        return True
        
    except Exception as e:
        print(f"❌ Erro durante migração: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("  MIGRATION: Porções e Escalamento")
    print("=" * 60)
    print("\n📊 Mudanças que serão aplicadas:")
    print("  - receitas.porcoes (INTEGER, default=1)")
    print("  - jobs.pessoas_solicitadas (INTEGER, default=1)")
    print("  - Migração de dados: multiplicador → pessoas_solicitadas")
    print("\n")
    
    # Backup
    if os.path.exists(DB_PATH):
        confirm = input("Fazer backup antes de continuar? (S/n): ").strip().lower()
        if confirm != 'n':
            backup_database()
    
    # Executa migration
    print("\n🔄 Executando migration...")
    
    if HAS_SQLALCHEMY:
        success = run_migration_sqlalchemy()
    else:
        success = run_migration_sqlite()
    
    if success:
        print("\n✅ Database atualizado com sucesso!")
        print("   Agora as receitas suportam escalamento baseado em porções.")
        sys.exit(0)
    else:
        print("\n❌ Falha na migration. Verifique o log acima.")
        if os.path.exists(BACKUP_PATH):
            print(f"   Backup disponível em: {BACKUP_PATH}")
        sys.exit(1)
