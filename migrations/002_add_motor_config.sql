-- Migration: Adicionar tabela motor_config
-- Criado em: 2025-11-17
-- Descrição: Configuração de motor de vibração por usuário

CREATE TABLE IF NOT EXISTS motor_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    vibration_intensity INTEGER NOT NULL DEFAULT 75,
    pre_start_delay_ms INTEGER NOT NULL DEFAULT 500,
    post_stop_delay_ms INTEGER NOT NULL DEFAULT 300,
    max_runtime_sec INTEGER NOT NULL DEFAULT 300,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_motor_config_user ON motor_config(user_id);
