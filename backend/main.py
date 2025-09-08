from fastapi import FastAPI, Depends, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from passlib.hash import bcrypt
from typing import Optional

from . import models, schemas, database

app = FastAPI(title="API Dispenser de Temperos")

# CORS (libera front no mesmo domínio/subdomínios)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://yaguts.com.br",
        "https://www.yaguts.com.br",
        "https://api.yaguts.com.br",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
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
def criar_receita(
    receita: schemas.ReceitaCreate,
    db: Session = Depends(get_db),
    dono_id: int = 1,
):
    if len(receita.ingredientes) == 0:
        raise HTTPException(status_code=400, detail="A receita precisa de pelo menos 1 ingrediente")

    db_receita = models.Receita(nome=receita.nome, dono_id=dono_id)
    db.add(db_receita)
    db.commit()
    db.refresh(db_receita)

    for ing in receita.ingredientes:
        item = models.IngredienteReceita(
            receita_id=db_receita.id,
            tempero=ing.tempero,        # <- corrigido
            frasco=ing.frasco,
            quantidade=ing.quantidade,
        )
        db.add(item)

    db.commit()
    db.refresh(db_receita)
    db_receita.ingredientes  # lazy-load
    return db_receita


# ---------- Helpers para o formulário ----------
def _to_int(v: Optional[str]) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except Exception:
        return None

def _to_float_01(v: Optional[str]) -> Optional[float]:
    """Converte para float com precisão de 0.1g; aceita string vazia como None."""
    if v is None or v == "":
        return None
    try:
        return round(float(v), 1)
    except Exception:
        return None


# ---------- Receitas (FORMULÁRIO HTML com até 4 linhas) ----------
@app.post("/receitas/form", response_model=schemas.Receita)
def criar_receita_form(
    nome: str = Form(...),

    # usar str|None para não falhar quando vier "" do form
    tempero1: Optional[str] = Form(None),
    reservatorio1: Optional[str] = Form(None),
    quantidade1: Optional[str] = Form(None),

    tempero2: Optional[str] = Form(None),
    reservatorio2: Optional[str] = Form(None),
    quantidade2: Optional[str] = Form(None),

    tempero3: Optional[str] = Form(None),
    reservatorio3: Optional[str] = Form(None),
    quantidade3: Optional[str] = Form(None),

    tempero4: Optional[str] = Form(None),
    reservatorio4: Optional[str] = Form(None),
    quantidade4: Optional[str] = Form(None),

    db: Session = Depends(get_db),
    dono_id: int = 1,
):
    ingredientes_input = []

    for t, r, q in [
        (tempero1, reservatorio1, quantidade1),
        (tempero2, reservatorio2, quantidade2),
        (tempero3, reservatorio3, quantidade3),
        (tempero4, reservatorio4, quantidade4),
    ]:
        r_i = _to_int(r)
        q_f = _to_float_01(q)
        if t and r_i is not None and q_f is not None:
            ingredientes_input.append(
                schemas.IngredienteBase(tempero=t, frasco=r_i, quantidade=q_f)
            )
        elif (t or r or q) and not (t and r_i is not None and q_f is not None):
            # Linha parcialmente preenchida -> erro amigável
            raise HTTPException(
                status_code=400,
                detail="Preencha todos os campos da linha selecionada (tempero, reservatório e quantidade).",
            )

    if not ingredientes_input:
        raise HTTPException(status_code=400, detail="Informe pelo menos 1 ingrediente completo.")

    receita_in = schemas.ReceitaCreate(nome=nome, ingredientes=ingredientes_input)
    return criar_receita(receita=receita_in, db=db, dono_id=dono_id)
