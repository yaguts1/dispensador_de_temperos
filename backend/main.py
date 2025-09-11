from fastapi import FastAPI, Depends, HTTPException, Form, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import IntegrityError
from passlib.hash import bcrypt
from typing import Optional, List, Iterable
from starlette import status

from . import models, schemas, database

app = FastAPI(title="API Dispenser de Temperos")

# ---------------------------------------------------------------------
# CORS (libera front no mesmo domínio/subdomínios e dev local)
# ---------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://yaguts.com.br",
        "https://www.yaguts.com.br",
        "https://api.yaguts.com.br",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------
# Inicialização / dependências
# ---------------------------------------------------------------------
@app.on_event("startup")
def on_startup() -> None:
    """Garante que as tabelas existam ao subir o serviço."""
    models.Base.metadata.create_all(bind=database.engine)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def root():
    return {"message": "API do Dispenser de Temperos está no ar 🚀"}

# ---------------------------------------------------------------------
# Usuários
# ---------------------------------------------------------------------
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

# ---------------------------------------------------------------------
# Utilidades de validação/parse
# ---------------------------------------------------------------------
def _to_int_or_none(v: Optional[str]) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except Exception:
        return None

def _valida_ingredientes(ingredientes: Iterable[schemas.IngredienteBase]) -> List[schemas.IngredienteBase]:
    """Valida regras de negócio: 1–4 itens, sem frasco repetido, quantidade 1..500 (inteira), frasco 1..4."""
    itens = list(ingredientes)
    if not (1 <= len(itens) <= 4):
        raise HTTPException(status_code=400, detail="A receita precisa ter de 1 a 4 ingredientes.")

    frascos = set()
    for ing in itens:
        # quantidade inteira 1..500
        try:
            q = int(ing.quantidade)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Quantidade inválida para '{ing.tempero}'. Use um inteiro 1–500 g.")
        if q < 1 or q > 500:
            raise HTTPException(status_code=400, detail=f"A quantidade de '{ing.tempero}' deve ser um inteiro entre 1 e 500 g.")
        ing.quantidade = q  # normaliza para int

        # frasco 1..4 e sem repetição
        if ing.frasco < 1 or ing.frasco > 4:
            raise HTTPException(status_code=400, detail=f"Reservatório inválido em '{ing.tempero}'. Use valores entre 1 e 4.")
        if ing.frasco in frascos:
            raise HTTPException(status_code=400, detail=f"O reservatório {ing.frasco} foi repetido.")
        frascos.add(ing.frasco)

    return itens

def _carregar_receita(db: Session, id: int) -> models.Receita:
    r = (
        db.query(models.Receita)
        .options(selectinload(models.Receita.ingredientes))
        .filter(models.Receita.id == id)
        .first()
    )
    return r

# ---------------------------------------------------------------------
# Receitas (JSON/Pydantic)
# ---------------------------------------------------------------------
@app.post("/receitas/", response_model=schemas.Receita, status_code=status.HTTP_201_CREATED)
def criar_receita(
    receita: schemas.ReceitaCreate,
    db: Session = Depends(get_db),
    dono_id: int = 1,
):
    if len(receita.ingredientes) == 0:
        raise HTTPException(status_code=400, detail="A receita precisa de pelo menos 1 ingrediente")

    # valida e normaliza (quantidade int, sem frasco repetido)
    itens = _valida_ingredientes(receita.ingredientes)

    db_receita = models.Receita(nome=receita.nome, dono_id=dono_id)
    db.add(db_receita)
    db.commit()
    db.refresh(db_receita)

    for ing in itens:
        db.add(models.IngredienteReceita(
            receita_id=db_receita.id,
            tempero=ing.tempero,
            frasco=ing.frasco,
            quantidade=ing.quantidade,
        ))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # proteção extra caso o UniqueConstraint seja violado por concorrência
        raise HTTPException(status_code=400, detail="Não é permitido repetir o mesmo reservatório na receita.")

    return _carregar_receita(db, db_receita.id)

# LISTA: GET /receitas/?limit=&offset=
@app.get("/receitas/", response_model=List[schemas.Receita])
def listar_receitas(
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    query = (
        db.query(models.Receita)
        .options(selectinload(models.Receita.ingredientes))
        .order_by(models.Receita.id.asc())
        .offset(offset)
        .limit(limit)
    )
    return list(query)

# DETALHE: GET /receitas/{id}
@app.get("/receitas/{id}", response_model=schemas.Receita)
def obter_receita(id: int, db: Session = Depends(get_db)):
    receita = _carregar_receita(db, id)
    if not receita:
        raise HTTPException(status_code=404, detail="Receita não encontrada.")
    return receita

# ATUALIZAR: PUT /receitas/{id}
@app.put("/receitas/{id}", response_model=schemas.Receita)
def atualizar_receita(
    id: int,
    receita: schemas.ReceitaCreate,  # mesmo shape do POST
    db: Session = Depends(get_db),
):
    db_receita = db.query(models.Receita).filter(models.Receita.id == id).first()
    if not db_receita:
        raise HTTPException(status_code=404, detail="Receita não encontrada.")

    itens = _valida_ingredientes(receita.ingredientes)

    # atualiza nome
    db_receita.nome = receita.nome

    # remove ingredientes anteriores e recria (mais simples e confiável)
    db.query(models.IngredienteReceita).filter(
        models.IngredienteReceita.receita_id == id
    ).delete(synchronize_session=False)

    for ing in itens:
        db.add(models.IngredienteReceita(
            receita_id=id,
            tempero=ing.tempero,
            frasco=ing.frasco,
            quantidade=ing.quantidade,
        ))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Não é permitido repetir o mesmo reservatório na receita.")

    return _carregar_receita(db, id)

# EXCLUIR: DELETE /receitas/{id}
@app.delete("/receitas/{id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_receita(id: int, db: Session = Depends(get_db)):
    receita = db.query(models.Receita).filter(models.Receita.id == id).first()
    if not receita:
        raise HTTPException(status_code=404, detail="Receita não encontrada.")
    db.delete(receita)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# ---------------------------------------------------------------------
# Receitas (FORMULÁRIO HTML com até 4 linhas)
# Mantém compatibilidade com o fallback do front (/receitas/form)
# ---------------------------------------------------------------------
@app.post("/receitas/form", response_model=schemas.Receita, status_code=status.HTTP_201_CREATED)
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
    ingredientes_input: List[schemas.IngredienteBase] = []

    for t, r, q in [
        (tempero1, reservatorio1, quantidade1),
        (tempero2, reservatorio2, quantidade2),
        (tempero3, reservatorio3, quantidade3),
        (tempero4, reservatorio4, quantidade4),
    ]:
        r_i = _to_int_or_none(r)
        q_i = _to_int_or_none(q)

        if t and r_i is not None and q_i is not None:
            ingredientes_input.append(
                schemas.IngredienteBase(tempero=t, frasco=r_i, quantidade=q_i)
            )
        elif (t or r or q) and not (t and r_i is not None and q_i is not None):
            # Linha parcialmente preenchida -> erro amigável
            raise HTTPException(
                status_code=400,
                detail="Preencha todos os campos da linha (tempero, reservatório e quantidade).",
            )

    if not ingredientes_input:
        raise HTTPException(status_code=400, detail="Informe pelo menos 1 ingrediente completo.")

    # valida regras (1..4 itens, sem frasco repetido, quantidade 1..500 inteiro)
    ingredientes_input = _valida_ingredientes(ingredientes_input)

    receita_in = schemas.ReceitaCreate(nome=nome, ingredientes=ingredientes_input)
    return criar_receita(receita=receita_in, db=db, dono_id=dono_id)
