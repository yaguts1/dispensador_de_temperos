# 🎯 PHASE 5 ROADMAP - Backend Integration

## Objetivo
Integrar o novo sistema de porções com o backend, substituindo o esquema multiplicador.

---

## 📋 Tarefas

### Task 1: Database Migrations

**Arquivo:** `backend/models.py`

#### Adicionar coluna `porcoes` à tabela `receitas`
```python
class Receita(Base):
    __tablename__ = 'receitas'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey('usuarios.id'))
    nome: Mapped[str] = mapped_column(String(100), index=True)
    descricao: Mapped[str | None] = mapped_column(String(500))
    
    # NOVO
    porcoes: Mapped[int] = mapped_column(Integer, default=1)
    # Quantidade de pessoas que a receita serve por padrão
    
    ingredientes: Mapped[list['IngredienteReceita']] = relationship(...)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, onupdate=datetime.utcnow)
```

#### Adicionar coluna `pessoas_solicitadas` à tabela `jobs`
```python
class Job(Base):
    __tablename__ = 'jobs'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    receita_id: Mapped[int] = mapped_column(ForeignKey('receitas.id'))
    usuario_id: Mapped[int] = mapped_column(ForeignKey('usuarios.id'))
    device_id: Mapped[int] = mapped_column(ForeignKey('dispositivos.id'))
    
    # REMOVER (legado)
    # multiplicador: Mapped[int] = mapped_column(Integer)
    
    # NOVO
    pessoas_solicitadas: Mapped[int] = mapped_column(Integer, default=1)
    # Quantidade de pessoas que o usuário quer servir
    
    status: Mapped[str] = mapped_column(String(50), default='pending')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
```

#### SQL Raw (se não usar Alembic)
```sql
-- Receitas
ALTER TABLE receitas ADD COLUMN porcoes INTEGER NOT NULL DEFAULT 1;

-- Jobs
ALTER TABLE jobs DROP COLUMN multiplicador;  -- ⚠️ Remover coluna legada
ALTER TABLE jobs ADD COLUMN pessoas_solicitadas INTEGER NOT NULL DEFAULT 1;

-- Índices (opcional)
CREATE INDEX idx_receitas_porcoes ON receitas(porcoes);
```

---

### Task 2: Schemas (Validação)

**Arquivo:** `backend/schemas.py`

#### Nova classe PessoasForm
```python
class PessoasForm(BaseModel):
    """Schema para criar job com número de pessoas (não multiplicador)"""
    receita_id: int
    pessoas_solicitadas: int = Field(
        default=1,
        ge=1,      # >= 1
        le=100,    # <= 100
        description="Número de pessoas a servir (1-100)"
    )
    
    class Config:
        schema_extra = {
            "example": {
                "receita_id": 1,
                "pessoas_solicitadas": 8
            }
        }
```

#### Atualizar ReceitaOut
```python
class ReceitaOut(BaseModel):
    id: int
    nome: str
    descricao: str | None
    
    # NOVO
    porcoes: int = Field(default=1, description="Pessoas base da receita")
    
    ingredientes: list['IngredienteReceitaOut']
    created_at: datetime
    
    class Config:
        from_attributes = True
```

#### Deprecar MultipladorForm (opcional)
```python
class MultipladorForm(BaseModel):
    """DEPRECATED: Use PessoasForm instead"""
    receita_id: int
    multiplicador: int = Field(
        default=1,
        ge=1,
        le=99,
        deprecated=True
    )
    
    class Config:
        schema_extra = {
            "deprecated": True,
            "note": "Use PessoasForm with pessoas_solicitadas instead"
        }
```

---

### Task 3: POST /jobs Endpoint

**Arquivo:** `backend/main.py`

#### Atualizar rota
```python
@app.post("/jobs", response_model=JobOut)
async def create_job(
    payload: PessoasForm,  # NOVO (era: MultipladorForm)
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Criar novo job com número de pessoas a servir"""
    
    # 1. Carregar receita
    receita = db.query(Receita).filter(
        Receita.id == payload.receita_id,
        Receita.usuario_id == current_user.id
    ).first()
    
    if not receita:
        raise HTTPException(status_code=404, detail="Receita não encontrada")
    
    # 2. Validar porcoes base existe
    if receita.porcoes is None or receita.porcoes < 1:
        # Backwards compatibility: defaultar para 1
        receita.porcoes = 1
        db.commit()
    
    # 3. Validar pessoas_solicitadas
    pessoas = payload.pessoas_solicitadas
    if not (1 <= pessoas <= 100):
        raise HTTPException(
            status_code=422,
            detail="pessoas_solicitadas deve estar entre 1 e 100"
        )
    
    # 4. Calcular escala (será usado no backend)
    escala = pessoas / receita.porcoes  # Ex: 8 / 4 = 2.0
    
    # 5. Validar se há device online
    device = db.query(Dispositivo).filter(
        Dispositivo.usuario_id == current_user.id,
        Dispositivo.online == True
    ).first()
    
    if not device:
        raise HTTPException(
            status_code=409,
            detail="Nenhum robô online agora"
        )
    
    # 6. Criar job
    job = Job(
        receita_id=receita.id,
        usuario_id=current_user.id,
        device_id=device.id,
        pessoas_solicitadas=pessoas,  # NOVO
        status='pending'
    )
    
    db.add(job)
    db.commit()
    db.refresh(job)
    
    return job


# DEPRECAR (optional, keep for backwards compat)
@app.post("/jobs/legacy", response_model=JobOut, deprecated=True)
async def create_job_legacy(
    payload: MultipladorForm,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """DEPRECATED: Use POST /jobs with PessoasForm instead"""
    # Converter multiplicador para pessoas_solicitadas
    # Assumir receita.porcoes como base
    # ...
    pass
```

---

### Task 4: GET /receitas/:id Response

**Arquivo:** `backend/main.py`

Garantir que `porcoes` está no response:

```python
@app.get("/receitas/{receita_id}", response_model=ReceitaOut)
async def get_receita(receita_id: int, db: Session = Depends(get_db)):
    receita = db.query(Receita).filter(Receita.id == receita_id).first()
    
    if not receita:
        raise HTTPException(status_code=404)
    
    # Response agora inclui: porcoes
    return receita
```

---

### Task 5: Testes Atualizados

**Arquivo:** `tests/test_api.py`

```python
def test_create_job_with_pessoas():
    """Test novo schema pessoas_solicitadas"""
    payload = {
        "receita_id": 1,
        "pessoas_solicitadas": 8
    }
    response = client.post("/jobs", json=payload)
    assert response.status_code == 201
    assert response.json()["pessoas_solicitadas"] == 8


def test_create_job_pessoas_validation():
    """Test validação 1-100"""
    # Deve falhar
    response = client.post("/jobs", json={
        "receita_id": 1,
        "pessoas_solicitadas": 101  # > 100
    })
    assert response.status_code == 422
    
    # Deve passar
    response = client.post("/jobs", json={
        "receita_id": 1,
        "pessoas_solicitadas": 50  # OK
    })
    assert response.status_code == 201


def test_receita_has_porcoes():
    """Test que receita retorna porcoes"""
    response = client.get("/receitas/1")
    assert response.status_code == 200
    assert "porcoes" in response.json()
    assert response.json()["porcoes"] >= 1
```

---

### Task 6: ESP32 Integration (Backend)

**Arquivo:** `backend/main.py`

Ao processar relatório de execução:

```python
@app.post("/devices/me/jobs/{job_id}/complete")
async def complete_job(
    job_id: int,
    payload: JobCompleteIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    job = db.query(Job).filter(Job.id == job_id).first()
    
    # Carregar receita para ter porcoes base
    receita = db.query(Receita).filter(Receita.id == job.receita_id).first()
    
    # Calcular escala (para logging/auditoria)
    escala = job.pessoas_solicitadas / receita.porcoes
    
    # Processar logs e abater estoque
    # (Lógica já existe, apenas precisa usar job.pessoas_solicitadas)
    for log in payload.execution_logs:
        if log.status == "done":
            # Abater estoque
            quantidade_usada = log.quantidade_g
            # quantidade_g já foi escalonada pelo ESP32
            # (ou será escalonada aqui se necessário)
    
    job.status = "completed"
    job.completed_at = datetime.utcnow()
    db.commit()
    
    return {"job_id": job.id, "status": "completed"}
```

---

## 📊 Checklist de Implementação

```
Database & Models:
  [ ] Adicionar coluna porcoes à Receita
  [ ] Adicionar coluna pessoas_solicitadas à Job
  [ ] Remover coluna multiplicador (ou deixar para compat)
  [ ] Testar migrations
  [ ] Backup do banco atual

Schemas:
  [ ] Criar PessoasForm (1-100 validation)
  [ ] Atualizar ReceitaOut (incluir porcoes)
  [ ] Deprecar MultipladorForm (opcional)
  [ ] Testar schemas

Endpoints:
  [ ] Atualizar POST /jobs (aceitar PessoasForm)
  [ ] Validar pessoas_solicitadas (1-100)
  [ ] Atualizar GET /receitas/:id (retornar porcoes)
  [ ] Manter POST /jobs/legacy (backwards compat)

Testes:
  [ ] Test schema validation
  [ ] Test POST /jobs com payload novo
  [ ] Test GET /receitas/:id (porcoes)
  [ ] Test erro: pessoas_solicitadas > 100
  [ ] Test erro: receita.porcoes = 0 (edge case)

Documentação:
  [ ] Atualizar API docs
  [ ] Adicionar migration guide
  [ ] Documentar descontinuação de multiplicador
  [ ] Exemplos cURL/Postman

Deployment:
  [ ] Database migration (test env)
  [ ] Deploy backend update
  [ ] Verificar logs (pessoas_solicitadas)
  [ ] Rollback plan se necessário
```

---

## 🚀 Estimativa

- **Migrations:** 30 min
- **Schema updates:** 20 min
- **Endpoint update:** 30 min
- **Tests:** 30 min
- **Documentation:** 20 min
- **Testing & debugging:** 30 min

**Total:** 2-3 horas

---

## ⚠️ Considerar

1. **Backwards Compatibility**
   - Receitas antigas sem `porcoes` → defaultar para 1
   - Jobs antigos com `multiplicador` → logs, mas não novos

2. **Data Migration**
   - Migrar dados de multiplicador → pessoas_solicitadas?
   - Ou aceitar como legado?

3. **Edge Cases**
   - receita.porcoes = 0 (nunca deve acontecer)
   - job.pessoas_solicitadas = 0 (schema valida)
   - receita.porcoes = NULL (backward compat: default=1)

4. **API Versioning**
   - /v1/jobs (novo com pessoas_solicitadas)
   - /jobs/legacy (velho com multiplicador)
   - Ou remover legado imediatamente?

---

## 📚 Referências

- Frontend PHASE 2: `/frontend/app.js` (_renderRunPreview)
- Proposta original: `PORTION_BASED_SCALING.md`
- Especificação cálculo: `PHASE_2_IMPLEMENTATION.md`

---

## ✅ Conclusão

PHASE 5 é straightforward:
1. Adicionar 2 colunas (porcoes, pessoas_solicitadas)
2. Criar schema de validação
3. Atualizar POST /jobs
4. Testes

**Tempo:** 2-3 horas  
**Complexidade:** Baixa-Média  
**Risk:** Baixo (frontend já pronto)  

---

**Próximo:** PHASE 5 Implementation  
**ETA:** Quando quiser começar 🚀
