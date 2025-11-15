-- Migration: Adicionar colunas porcoes e pessoas_solicitadas
-- Data: 2025-11-15
-- Descrição: Sistema de escalamento baseado em porções

-- Adicionar coluna porcoes na tabela receitas
ALTER TABLE receitas 
ADD COLUMN IF NOT EXISTS porcoes INTEGER NOT NULL DEFAULT 1
CHECK (porcoes >= 1 AND porcoes <= 20);

COMMENT ON COLUMN receitas.porcoes IS 'Porção base: para quantas pessoas é a receita (1-20)';

-- Adicionar coluna pessoas_solicitadas na tabela jobs
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS pessoas_solicitadas INTEGER NOT NULL DEFAULT 1
CHECK (pessoas_solicitadas >= 1 AND pessoas_solicitadas <= 100);

COMMENT ON COLUMN jobs.pessoas_solicitadas IS 'Para quantas pessoas executar o job (escalamento)';

-- Índice para queries por porções
CREATE INDEX IF NOT EXISTS idx_receitas_porcoes ON receitas(porcoes);

-- Índice para queries por pessoas solicitadas
CREATE INDEX IF NOT EXISTS idx_jobs_pessoas ON jobs(pessoas_solicitadas);

-- Migrar dados existentes: copiar multiplicador para pessoas_solicitadas
UPDATE jobs 
SET pessoas_solicitadas = multiplicador 
WHERE pessoas_solicitadas = 1 AND multiplicador > 1;

-- Nota: A coluna multiplicador é mantida por backwards compatibility
-- mas será deprecated em favor de pessoas_solicitadas
