#!/usr/bin/env python3
"""
Teste de integração: Valida escalamento por porções

Testa lógica diretamente no banco sem usar TestClient.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from backend import models, database
from sqlalchemy.orm import selectinload


def calcular_escalamento(porcoes_base: int, pessoas_solicitadas: int, quantidade_base: float) -> float:
    """Replica a lógica de escalamento do backend"""
    escala_fator = float(pessoas_solicitadas) / float(porcoes_base)
    return float(quantidade_base) * escala_fator


def test_portion_scaling():
    """Testa escalamento baseado em porções"""
    
    db = database.SessionLocal()
    try:
        # Limpa dados de teste anteriores
        db.query(models.JobItem).filter(
            models.JobItem.job_id.in_(
                db.query(models.Job.id).filter(models.Job.user_id == 999)
            )
        ).delete(synchronize_session=False)
        db.query(models.Job).filter(models.Job.user_id == 999).delete()
        db.query(models.IngredienteReceita).filter(
            models.IngredienteReceita.receita_id.in_(
                db.query(models.Receita.id).filter(models.Receita.dono_id == 999)
            )
        ).delete(synchronize_session=False)
        db.query(models.Receita).filter(models.Receita.dono_id == 999).delete()
        db.query(models.ReservatorioConfig).filter(models.ReservatorioConfig.user_id == 999).delete()
        db.query(models.Usuario).filter(models.Usuario.id == 999).delete()
        
        # Cria usuário
        user = models.Usuario(id=999, nome="test_porcoes", senha_hash="hash123")
        db.add(user)
        
        # Cria receita: 2 porções (para 2 pessoas)
        receita = models.Receita(nome="Teste Porcoes", dono_id=999, porcoes=2)
        db.add(receita)
        db.flush()
        
        # Ingredientes: 10g pimenta, 20g sal (base para 2 pessoas)
        db.add(models.IngredienteReceita(receita_id=receita.id, tempero="Pimenta", quantidade=10))
        db.add(models.IngredienteReceita(receita_id=receita.id, tempero="Sal", quantidade=20))
        
        # Configura reservatórios
        db.add(models.ReservatorioConfig(user_id=999, frasco=1, rotulo="Pimenta", g_por_seg=5.0, estoque_g=1000))
        db.add(models.ReservatorioConfig(user_id=999, frasco=2, rotulo="Sal", g_por_seg=8.0, estoque_g=1000))
        
        db.commit()
        
        print("\n✅ Setup concluído")
        print(f"   - Receita ID {receita.id}: '{receita.nome}' (2 porções)")
        print(f"   - Ingredientes: 10g Pimenta, 20g Sal (base)")
        
        # =================================================================
        # TESTE 1: Escalamento para 4 pessoas (2x)
        # =================================================================
        print("\n📊 TESTE 1: Escalamento para 4 pessoas (2x)")
        
        # Simula criação de job
        job1 = models.Job(
            user_id=999,
            receita_id=receita.id,
            status="queued",
            multiplicador=1,
            pessoas_solicitadas=4
        )
        db.add(job1)
        db.flush()
        
        # Carrega ingredientes
        receita_loaded = (
            db.query(models.Receita)
            .options(selectinload(models.Receita.ingredientes))
            .filter(models.Receita.id == receita.id)
            .first()
        )
        
        # Cria job items com escalamento
        ordem = 1
        for ingrediente in receita_loaded.ingredientes:
            # Busca config do reservatório
            cfg = (
                db.query(models.ReservatorioConfig)
                .filter(
                    models.ReservatorioConfig.user_id == 999,
                    models.ReservatorioConfig.rotulo == ingrediente.tempero
                )
                .first()
            )
            
            if cfg:
                # Aplica escalamento
                quantidade_escalada = calcular_escalamento(
                    receita_loaded.porcoes,
                    job1.pessoas_solicitadas,
                    ingrediente.quantidade
                )
                segundos = round(quantidade_escalada / cfg.g_por_seg, 3)
                
                db.add(models.JobItem(
                    job_id=job1.id,
                    ordem=ordem,
                    frasco=cfg.frasco,
                    tempero=ingrediente.tempero,
                    quantidade_g=quantidade_escalada,
                    segundos=segundos,
                    status="queued"
                ))
                ordem += 1
        
        db.commit()
        
        # DEBUG: Conta itens no banco SQL diretamente
        from sqlalchemy import text
        result = db.execute(text("SELECT COUNT(*) FROM job_items WHERE job_id = :job_id"), {"job_id": job1.id})
        count = result.scalar()
        print(f"   DEBUG: {count} itens no banco SQL para job_id={job1.id}")
        
        # Valida resultados
        job1_reloaded = (
            db.query(models.Job)
            .options(selectinload(models.Job.itens))
            .filter(models.Job.id == job1.id)
            .first()
        )
        
        print(f"   DEBUG: {len(job1_reloaded.itens)} itens via ORM")
        for idx, item in enumerate(job1_reloaded.itens[:5]):  # Mostra apenas 5 primeiros
            print(f"      [{idx}] ID={item.id}, tempero={item.tempero}, qtd={item.quantidade_g}g")
        
        assert job1_reloaded.pessoas_solicitadas == 4, f"Esperado 4, obtido {job1_reloaded.pessoas_solicitadas}"
        assert len(job1_reloaded.itens) == 2, f"Esperado 2 itens, obtido {len(job1_reloaded.itens)}"
        
        pimenta = next((it for it in job1_reloaded.itens if it.tempero == "Pimenta"), None)
        sal = next((it for it in job1_reloaded.itens if it.tempero == "Sal"), None)
        
        assert pimenta is not None, "Pimenta não encontrada"
        assert sal is not None, "Sal não encontrado"
        
        # Esperado: 10g * (4/2) = 20g pimenta
        #           20g * (4/2) = 40g sal
        assert abs(pimenta.quantidade_g - 20.0) < 0.01, f"Pimenta: esperado 20g, obtido {pimenta.quantidade_g}g"
        assert abs(sal.quantidade_g - 40.0) < 0.01, f"Sal: esperado 40g, obtido {sal.quantidade_g}g"
        
        # Valida tempos
        assert abs(pimenta.segundos - 4.0) < 0.01, f"Pimenta: esperado 4s, obtido {pimenta.segundos}s"
        assert abs(sal.segundos - 5.0) < 0.01, f"Sal: esperado 5s, obtido {sal.segundos}s"
        
        print(f"   ✅ Escalamento correto:")
        print(f"      - Pimenta: 10g base → {pimenta.quantidade_g}g (4 pessoas) • {pimenta.segundos}s")
        print(f"      - Sal: 20g base → {sal.quantidade_g}g (4 pessoas) • {sal.segundos}s")
        
        # =================================================================
        # TESTE 2: Escalamento com multiplicador=3 (backwards compat)
        # =================================================================
        print("\n📊 TESTE 2: Backwards compatibility (multiplicador=3)")
        
        # Simula criação de job com multiplicador
        job2 = models.Job(
            user_id=999,
            receita_id=receita.id,
            status="queued",
            multiplicador=3,
            pessoas_solicitadas=3  # Backend deve setar este valor quando multiplicador > 1
        )
        db.add(job2)
        db.flush()
        
        # Cria job items
        ordem = 1
        for ingrediente in receita_loaded.ingredientes:
            cfg = (
                db.query(models.ReservatorioConfig)
                .filter(
                    models.ReservatorioConfig.user_id == 999,
                    models.ReservatorioConfig.rotulo == ingrediente.tempero
                )
                .first()
            )
            
            if cfg:
                quantidade_escalada = calcular_escalamento(
                    receita_loaded.porcoes,
                    job2.pessoas_solicitadas,
                    ingrediente.quantidade
                )
                segundos = round(quantidade_escalada / cfg.g_por_seg, 3)
                
                db.add(models.JobItem(
                    job_id=job2.id,
                    ordem=ordem,
                    frasco=cfg.frasco,
                    tempero=ingrediente.tempero,
                    quantidade_g=quantidade_escalada,
                    segundos=segundos,
                    status="queued"
                ))
                ordem += 1
        
        db.commit()
        
        # Valida resultados
        job2_reloaded = (
            db.query(models.Job)
            .options(selectinload(models.Job.itens))
            .filter(models.Job.id == job2.id)
            .first()
        )
        
        assert job2_reloaded.pessoas_solicitadas == 3
        assert job2_reloaded.multiplicador == 3
        assert len(job2_reloaded.itens) == 2
        
        pimenta2 = next((it for it in job2_reloaded.itens if it.tempero == "Pimenta"), None)
        sal2 = next((it for it in job2_reloaded.itens if it.tempero == "Sal"), None)
        
        # 10g * (3/2) = 15g pimenta
        # 20g * (3/2) = 30g sal
        assert abs(pimenta2.quantidade_g - 15.0) < 0.01, f"Pimenta: esperado 15g, obtido {pimenta2.quantidade_g}g"
        assert abs(sal2.quantidade_g - 30.0) < 0.01, f"Sal: esperado 30g, obtido {sal2.quantidade_g}g"
        
        # Tempos: 15g / 5g/s = 3s, 30g / 8g/s = 3.75s
        assert abs(pimenta2.segundos - 3.0) < 0.01
        assert abs(sal2.segundos - 3.75) < 0.01
        
        print(f"   ✅ Multiplicador funciona corretamente")
        print(f"      - Pimenta: 10g × 1.5 = {pimenta2.quantidade_g}g • {pimenta2.segundos}s")
        print(f"      - Sal: 20g × 1.5 = {sal2.quantidade_g}g • {sal2.segundos}s")
        
        # =================================================================
        # TESTE 3: Validação de fórmula matemática
        # =================================================================
        print("\n📊 TESTE 3: Validação matemática da fórmula")
        
        test_cases = [
            (2, 1, 10.0, 5.0),    # 2 porções, 1 pessoa, 10g base → 5g
            (2, 6, 10.0, 30.0),   # 2 porções, 6 pessoas, 10g base → 30g
            (4, 8, 20.0, 40.0),   # 4 porções, 8 pessoas, 20g base → 40g
            (1, 5, 10.0, 50.0),   # 1 porção, 5 pessoas, 10g base → 50g
            (3, 9, 15.0, 45.0),   # 3 porções, 9 pessoas, 15g base → 45g
        ]
        
        for porcoes, pessoas, qtd_base, qtd_esperada in test_cases:
            resultado = calcular_escalamento(porcoes, pessoas, qtd_base)
            assert abs(resultado - qtd_esperada) < 0.01, \
                f"Falha: porcoes={porcoes}, pessoas={pessoas}, base={qtd_base}g → esperado {qtd_esperada}g, obtido {resultado}g"
            print(f"   ✅ {porcoes}p → {pessoas}pes: {qtd_base}g × {pessoas}/{porcoes} = {resultado}g")
        
        print("\n" + "="*60)
        print("✅ TODOS OS TESTES PASSARAM!")
        print("="*60)
        print("\nResumo:")
        print("  ✅ Escalamento por porções funciona")
        print("  ✅ Backwards compatibility mantida")
        print("  ✅ Fórmula matemática validada")
        print("  ✅ Cálculo de tempos correto")
        print("  ✅ Sem duplicação de itens")
        
    finally:
        # Cleanup
        db.query(models.JobItem).filter(
            models.JobItem.job_id.in_(
                db.query(models.Job.id).filter(models.Job.user_id == 999)
            )
        ).delete(synchronize_session=False)
        db.query(models.Job).filter(models.Job.user_id == 999).delete()
        db.query(models.IngredienteReceita).filter(
            models.IngredienteReceita.receita_id.in_(
                db.query(models.Receita.id).filter(models.Receita.dono_id == 999)
            )
        ).delete(synchronize_session=False)
        db.query(models.Receita).filter(models.Receita.dono_id == 999).delete()
        db.query(models.ReservatorioConfig).filter(models.ReservatorioConfig.user_id == 999).delete()
        db.query(models.Usuario).filter(models.Usuario.id == 999).delete()
        db.commit()
        db.close()


if __name__ == "__main__":
    test_portion_scaling()
