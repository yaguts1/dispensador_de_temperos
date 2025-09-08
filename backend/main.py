from fastapi import FastAPI, Depends, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from passlib.hash import bcrypt
from typing import List, Optional
from . import models, schemas, database

app = FastAPI(title="API Dispenser de Temperos")

# CORS (libera front no mesmo domínio/subdomínios)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yaguts.com.br", "https://www.yaguts.com.br", "https://api.yaguts.com.br", "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# cria tabelas no startup (melhor que no import)
@app.on_event("startup")
def on_startup():
    models.Base.metadata.create_all(bind=database.engine)

# Dependência de sessão
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def root():
    return {"message": "API do Dispenser de Temperos está no ar 🚀"}

# ---------- Usuários ----------
@app.post("/usuarios/", response_model=schemas.Usuario)
def criar_usuario(usuario: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    # checa duplicado
    if db.query(models.Usuario).filter(models.Usuario.nome == usuario.nome).first():
        raise HTTPException(status_code=400, detail="Usuário já existe")
    db_usuario = models.Usuario(nome=usuario.nome, senha_hash=bcrypt.hash(usuario.senha))
    db.add(db_usuario)
    db.commit()
    db.refresh(db_usuario)
    return db_usuario

# ---------- Receitas (JSON/Pydantic) ----------
@app.post("/receitas/", response_model=schemas.Receita)
def criar_receita(receita: schemas.ReceitaCreate, db: Session = Depends(get_db), dono_id: int = 1):
    if len(receita.ingredientes) == 0:
        raise HTTPException(status_code=400, detail="A receita precisa de pelo menos 1 ingrediente")

    db_receita = models.Receita(nome=receita.nome, dono_id=dono_id)
    db.add(db_receita)
    db.commit()
    db.refresh(db_receita)

    for ing in receita.ingredientes:
        item = models.IngredienteReceita(
            receita_id=db_receita.id,
            tempero=ing. tempero,
            frasco=ing.frasco,
            quantidade=ing.quantidade
        )
        db.add(item)

    db.commit()
    db.refresh(db_receita)
    # carrega ingredientes para o response_model
    db_receita.ingredientes  # lazy-load
    return db_receita

# ---------- Receitas (FORMULÁRIO HTML com até 4 linhas) ----------
@app.post("/receitas/form", response_model=schemas.Receita)
def criar_receita_form(
    nome: str = Form(...),

    tempero1: Optional[str] = Form(None),
    reservatorio1: Optional[int] = Form(None),
    quantidade1: Optional[float] = Form(None),

    tempero2: Optional[str] = Form(None),
    reservatorio2: Optional[int] = Form(None),
    quantidade2: Optional[float] = Form(None),

    tempero3: Optional[str] = Form(None),
    reservatorio3: Optional[int] = Form(None),
    quantidade3: Optional[float] = Form(None),

    tempero4: Optional[str] = Form(None),
    reservatorio4: Optional[int] = Form(None),
    quantidade4: Optional[float] = Form(None),

    db: Session = Depends(get_db),
    dono_id: int = 1
):
    # monta lista a partir das linhas preenchidas
    ingredientes_input = []
    for t, r, q in [
        (tempero1, reservatorio1, quantidade1),
        (tempero2, reservatorio2, quantidade2),
        (tempero3, reservatorio3, quantidade3),
        (tempero4, reservatorio4, quantidade4),
    ]:
        if t and r and q:
            ingredientes_input.append(schemas.IngredienteBase(tempero=t, frasco=int(r), quantidade=float(q)))

    if not ingredientes_input:
        raise HTTPException(status_code=400, detail="Informe pelo menos 1 ingrediente completo.")

    # valida com Pydantic (aplica limites, máximo 4, etc.)
    receita_in = schemas.ReceitaCreate(nome=nome, ingredientes=ingredientes_input)
    # reaproveita a função JSON
    return criar_receita(receita=receita_in, db=db, dono_id=dono_id)
