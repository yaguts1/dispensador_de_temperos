from fastapi import FastAPI, Depends, HTTPException, Form, Query, Response, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, selectinload
from passlib.hash import bcrypt
from typing import Optional, List, Iterable, Tuple, Dict
from starlette import status
from sqlalchemy import func
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
import os
import json
from random import randint

from . import models, schemas, database

app = FastAPI(title="API Dispenser de Temperos")

# ---------------------------------------------------------------------
# CORS
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
# JWT / Cookies
# ---------------------------------------------------------------------
ALGORITHM = "HS256"
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", str(60 * 24 * 7)))  # 7 dias
COOKIE_NAME = "access_token"
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", ".yaguts.com.br")  # para dev local, deixe vazio ""
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "1") == "1"        # produção: 1, dev: 0
COOKIE_SAMESITE = "Lax"  # subdomínios são "same-site", Lax funciona bem

# Catálogo base (padrão)
DEFAULT_TEMPEROS = [
    "Pimenta",
    "Sal",
    "Alho em pó",
    "Orégano",
    "Cominho",
]


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_MINUTES))
    to_encode.update({"iat": int(now.timestamp()), "exp": int(expire.timestamp())})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def set_auth_cookie(resp: Response, token: str) -> None:
    max_age = ACCESS_TOKEN_MINUTES * 60  # segundos
    resp.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age,
        expires=max_age,
        domain=COOKIE_DOMAIN or None,
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE,
    )


def clear_auth_cookie(resp: Response) -> None:
    resp.delete_cookie(
        key=COOKIE_NAME,
        domain=COOKIE_DOMAIN or None,
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE,
    )


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------
# Inicialização
# ---------------------------------------------------------------------
@app.on_event("startup")
def on_startup() -> None:
    models.Base.metadata.create_all(bind=database.engine)


@app.get("/")
def root():
    return {"message": "API do Dispenser de Temperos está no ar 🚀"}


# ---------------------------------------------------------------------
# Auth helpers (usuário)
# ---------------------------------------------------------------------
def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> models.Usuario:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado.")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        uid = int(payload.get("sub"))
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida.")
    user = db.query(models.Usuario).filter(models.Usuario.id == uid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado.")
    return user


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[models.Usuario]:
    """Versão que NÃO erra 401 — usada para o catálogo (retorna default se sem sessão)."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        uid = int(payload.get("sub"))
    except (JWTError, ValueError, TypeError):
        return None
    return db.query(models.Usuario).filter(models.Usuario.id == uid).first()


# ---------------------------------------------------------------------
# Auth helpers (dispositivo)
# ---------------------------------------------------------------------
def create_device_token(device_id: int, expires_delta: Optional[timedelta] = None) -> str:
    payload = {"sub": f"dev:{device_id}", "typ": "device"}
    return create_access_token(payload, expires_delta or timedelta(days=180))

def _parse_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    if not authorization.lower().startswith("bearer "):
        return None
    return authorization[7:].strip()

def get_current_device(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
) -> models.Device:
    token = _parse_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Token do dispositivo ausente.")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("typ") != "device":
            raise JWTError("tipo inválido")
        sub = payload.get("sub") or ""
        if not sub.startswith("dev:"):
            raise JWTError("sub inválido")
        dev_id = int(sub.split(":", 1)[1])
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido.")
    dev = db.query(models.Device).filter(models.Device.id == dev_id).first()
    if not dev:
        raise HTTPException(status_code=401, detail="Dispositivo não encontrado.")
    return dev


# ---------------------------------------------------------------------
# Usuários / Autenticação
# ---------------------------------------------------------------------
@app.post("/auth/register", response_model=schemas.Usuario, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    if db.query(models.Usuario).filter(models.Usuario.nome == payload.nome).first():
        raise HTTPException(status_code=400, detail="Usuário já existe.")
    user = models.Usuario(nome=payload.nome, senha_hash=bcrypt.hash(payload.senha))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=schemas.Usuario)
def login(payload: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    user = db.query(models.Usuario).filter(models.Usuario.nome == payload.nome).first()
    if not user or not bcrypt.verify(payload.senha, user.senha_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas.")
    token = create_access_token({"sub": str(user.id), "nome": user.nome})
    resp = JSONResponse(status_code=200, content={"id": user.id, "nome": user.nome})
    set_auth_cookie(resp, token)
    return resp


@app.post("/auth/logout")
def logout():
    resp = JSONResponse(status_code=200, content={"detail": "ok"})
    clear_auth_cookie(resp)
    return resp


@app.get("/auth/me", response_model=schemas.Usuario)
def me(current: models.Usuario = Depends(get_current_user)):
    return schemas.Usuario(id=current.id, nome=current.nome)


# (rota legacy se ainda quiser criar usuário manualmente sem auth)
@app.post("/usuarios/", response_model=schemas.Usuario)
def criar_usuario(usuario: schemas.UsuarioCreate, db: Session = Depends(get_db)):
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
    itens = list(ingredientes)
    if not (1 <= len(itens) <= 4):
        raise HTTPException(status_code=400, detail="A receita precisa ter de 1 a 4 ingredientes.")

    for ing in itens:
        # quantidade inteira 1..500
        try:
            q = int(ing.quantidade)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Quantidade inválida para '{(ing.tempero or '').strip()}'. Use um inteiro 1–500 g.")
        if q < 1 or q > 500:
            raise HTTPException(status_code=400, detail=f"A quantidade de '{(ing.tempero or '').strip()}' deve ter até 60 caracteres.")
        ing.quantidade = q

        nome = (ing.tempero or "").strip()
        if not nome:
            raise HTTPException(status_code=400, detail="O nome do tempero não pode ser vazio.")
        if len(nome) > 60:
            raise HTTPException(status_code=400, detail="O nome do tempero deve ter até 60 caracteres.")

    return itens


def _carregar_receita(db: Session, id: int) -> models.Receita:
    return (
        db.query(models.Receita)
        .options(selectinload(models.Receita.ingredientes))
        .filter(models.Receita.id == id)
        .first()
    )


def _get_tempero_catalog(db: Session, user_id: Optional[int]) -> List[str]:
    """
    Retorna a lista de temperos disponível para seleção de rótulos dos reservatórios:
    - DEFAULT_TEMPEROS + todos os temperos usados nas receitas do usuário (únicos, case-insensitive)
    """
    base = list(DEFAULT_TEMPEROS)
    extras: List[str] = []
    if user_id:
        rows = (
            db.query(models.IngredienteReceita.tempero)
            .join(models.Receita, models.IngredienteReceita.receita_id == models.Receita.id)
            .filter(models.Receita.dono_id == user_id)
            .distinct()
            .all()
        )
        extras = [r[0] for r in rows if r[0]]

    seen = {}
    for name in base + extras:
        if not name:
            continue
        k = name.strip()
        if not k:
            continue
        low = k.lower()
        if low not in seen:
            seen[low] = k  # preserva a primeira grafia
    # ordena de forma amigável
    return sorted(seen.values(), key=lambda s: s.casefold())


# ---------------------------------------------------------------------
# Catálogo de temperos
# ---------------------------------------------------------------------
@app.get("/catalogo/temperos", response_model=List[str])
def catalogo_temperos(
    opt_user: Optional[models.Usuario] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    user_id = opt_user.id if opt_user else None
    return _get_tempero_catalog(db, user_id)


# ---------------------------------------------------------------------
# Receitas (JSON/Pydantic) — escopo do usuário logado
# ---------------------------------------------------------------------
@app.post("/receitas/", response_model=schemas.Receita, status_code=status.HTTP_201_CREATED)
def criar_receita(
    receita: schemas.ReceitaCreate,
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if len(receita.ingredientes) == 0:
        raise HTTPException(status_code=400, detail="A receita precisa de pelo menos 1 ingrediente")

    itens = _valida_ingredientes(receita.ingredientes)

    db_receita = models.Receita(nome=receita.nome, dono_id=current.id)
    db.add(db_receita)
    db.commit()
    db.refresh(db_receita)

    for ing in itens:
        db.add(
            models.IngredienteReceita(
                receita_id=db_receita.id,
                tempero=ing.tempero,
                quantidade=ing.quantidade,
            )
        )

    db.commit()
    return _carregar_receita(db, db_receita.id)


@app.get("/receitas/", response_model=List[schemas.Receita])
def listar_receitas(
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, min_length=1),
):
    query = (
        db.query(models.Receita)
        .options(selectinload(models.Receita.ingredientes))
        .filter(models.Receita.dono_id == current.id)
        .order_by(models.Receita.id.asc())
    )
    if q:
        qn = q.strip().lower()
        query = query.filter(func.lower(models.Receita.nome).contains(qn))
    query = query.offset(offset).limit(limit)
    return list(query)


@app.get("/receitas/{id}", response_model=schemas.Receita)
def obter_receita(
    id: int,
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    receita = _carregar_receita(db, id)
    if not receita or receita.dono_id != current.id:
        raise HTTPException(status_code=404, detail="Receita não encontrada.")
    return receita


@app.get("/receitas/sugestoes", response_model=List[schemas.SugestaoReceita])
def sugerir_receitas(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=50),
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    qn = q.strip().lower()
    if not qn:
        return []
    rows = (
        db.query(models.Receita.id, models.Receita.nome)
        .filter(models.Receita.dono_id == current.id)
        .filter(func.lower(models.Receita.nome).contains(qn))
        .order_by(models.Receita.nome.asc())
        .limit(limit)
        .all()
    )
    return [{"id": r[0], "nome": r[1]} for r in rows]


@app.put("/receitas/{id}", response_model=schemas.Receita)
def atualizar_receita(
    id: int,
    receita: schemas.ReceitaCreate,
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_receita = db.query(models.Receita).filter(models.Receita.id == id).first()
    if not db_receita or db_receita.dono_id != current.id:
        raise HTTPException(status_code=404, detail="Receita não encontrada.")

    itens = _valida_ingredientes(receita.ingredientes)

    db_receita.nome = receita.nome

    db.query(models.IngredienteReceita).filter(
        models.IngredienteReceita.receita_id == id
    ).delete(synchronize_session=False)

    for ing in itens:
        db.add(
            models.IngredienteReceita(
                receita_id=id,
                tempero=ing.tempero,
                quantidade=ing.quantidade,
            )
        )

    db.commit()
    return _carregar_receita(db, id)


@app.delete("/receitas/{id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_receita(
    id: int,
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    receita = db.query(models.Receita).filter(models.Receita.id == id).first()
    if not receita or receita.dono_id != current.id:
        raise HTTPException(status_code=404, detail="Receita não encontrada.")
    db.delete(receita)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------
# Receitas (FORM HTML com até 4 linhas) — usa cookie de sessão
# ---------------------------------------------------------------------
@app.post("/receitas/form", response_model=schemas.Receita, status_code=status.HTTP_201_CREATED)
def criar_receita_form(
    nome: str = Form(...),

    tempero1: Optional[str] = Form(None),
    quantidade1: Optional[str] = Form(None),

    tempero2: Optional[str] = Form(None),
    quantidade2: Optional[str] = Form(None),

    tempero3: Optional[str] = Form(None),
    quantidade3: Optional[str] = Form(None),

    tempero4: Optional[str] = Form(None),
    quantidade4: Optional[str] = Form(None),

    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ingredientes_input: List[schemas.IngredienteBase] = []

    for t, q in [
        (tempero1, quantidade1),
        (tempero2, quantidade2),
        (tempero3, quantidade3),
        (tempero4, quantidade4),
    ]:
        q_i = _to_int_or_none(q)

        if t and q_i is not None:
            ingredientes_input.append(
                schemas.IngredienteBase(tempero=t, quantidade=q_i)
            )
        elif (t or q) and not (t and q_i is not None):
            raise HTTPException(
                status_code=400,
                detail="Preencha todos os campos da linha (tempero e quantidade).",
            )

    if not ingredientes_input:
        raise HTTPException(status_code=400, detail="Informe pelo menos 1 ingrediente completo.")

    ingredientes_input = _valida_ingredientes(ingredientes_input)

    receita_in = schemas.ReceitaCreate(nome=nome, ingredientes=ingredientes_input)
    return criar_receita(receita=receita_in, current=current, db=db)


# ---------------------------------------------------------------------
# Configuração do Robô (por usuário logado)
# ---------------------------------------------------------------------
@app.get("/config/robo", response_model=List[schemas.ReservatorioConfigOut])
def get_config_robo(
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(get_current_user),
):
    rows = (
        db.query(models.ReservatorioConfig)
        .filter(models.ReservatorioConfig.user_id == current.id)
        .order_by(models.ReservatorioConfig.frasco.asc())
        .all()
    )
    return rows


@app.put("/config/robo", response_model=List[schemas.ReservatorioConfigOut])
def put_config_robo(
    itens: List[schemas.ReservatorioConfigIn],
    db: Session = Depends(get_db),
    current: models.Usuario = Depends(get_current_user),
):
    # valida frascos e duplicidade
    vistos = set()
    for it in itens:
        if it.frasco in vistos:
            raise HTTPException(status_code=400, detail=f"Reservatório {it.frasco} duplicado.")
        vistos.add(it.frasco)
        if it.frasco < 1 or it.frasco > 4:
            raise HTTPException(status_code=400, detail="Frasco deve ser 1..4.")

    # carrega catálogo permitido e cria índice case-insensitive
    catalogo = _get_tempero_catalog(db, current.id)
    idx = {c.lower(): c for c in catalogo}

    # normaliza/valida rótulos conforme catálogo
    for it in itens:
        if it.rotulo is None:
            continue
        r = it.rotulo.strip()
        if r == "":
            it.rotulo = None
            continue
        canon = idx.get(r.lower())
        if not canon:
            raise HTTPException(
                status_code=400,
                detail="Rótulo inválido. Escolha apenas temperos da lista disponível."
            )
        it.rotulo = canon  # normaliza para a grafia canônica do catálogo

    # upsert
    result = []
    for it in itens:
        row = (
            db.query(models.ReservatorioConfig)
            .filter(
                models.ReservatorioConfig.user_id == current.id,
                models.ReservatorioConfig.frasco == it.frasco,
            )
            .first()
        )
        if not row:
            row = models.ReservatorioConfig(
                user_id=current.id,
                frasco=it.frasco,
                rotulo=it.rotulo,
                g_por_seg=it.g_por_seg,
                estoque_g=it.estoque_g,
            )
            db.add(row)
        else:
            row.rotulo = it.rotulo
            row.g_por_seg = it.g_por_seg
            row.estoque_g = it.estoque_g
        db.flush()
        result.append(row)

    db.commit()
    return result


# ---------------------------------------------------------------------
# Jobs — mapeamento + verificação
#  (ABATIMENTO DE ESTOQUE AGORA É FEITO QUANDO O DISPOSITIVO FINALIZA O JOB)
# ---------------------------------------------------------------------
def _resolver_mapeamento(
    db: Session, user_id: int, ingredientes: List[models.IngredienteReceita]
) -> Tuple[List[Tuple[int, str, int, float]], List[str], List[str]]:
    """
    Retorna:
      - lista de tuplas (frasco, tempero, quantidade_g, g_por_seg) já mapeadas,
      - lista de temperos com mapeamento ausente,
      - lista de temperos sem calibração (g/s ausente ou <=0)

    Regras:
      - match por rotulo == tempero (case-insensitive)
      - se vários frascos tiverem o mesmo rótulo, prioriza os com g/s definido; desempate por número do frasco.
    """
    itens_mapeados: List[Tuple[int, str, int, float]] = []
    faltam_mapeamento: List[str] = []
    faltam_calibracao: List[str] = []

    for ing in ingredientes:
        nome = ing.tempero.strip()
        q_g = int(ing.quantidade)

        configs = (
            db.query(models.ReservatorioConfig)
            .filter(
                models.ReservatorioConfig.user_id == user_id,
                func.lower(models.ReservatorioConfig.rotulo) == func.lower(nome),
            )
            .order_by(
                (models.ReservatorioConfig.g_por_seg.isnot(None)).desc(),
                models.ReservatorioConfig.frasco.asc(),
            )
            .all()
        )

        if not configs:
            faltam_mapeamento.append(nome)
            continue

        cfg = configs[0]
        if cfg.g_por_seg is None or cfg.g_por_seg <= 0:
            faltam_calibracao.append(nome)
            continue

        itens_mapeados.append((cfg.frasco, nome, q_g, float(cfg.g_por_seg)))

    return itens_mapeados, faltam_mapeamento, faltam_calibracao


@app.post("/jobs", response_model=schemas.JobOut, status_code=status.HTTP_201_CREATED)
def criar_job(
    payload: schemas.JobCreateIn,
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1 job por vez
    ativo = (
        db.query(models.Job)
        .filter(
            models.Job.user_id == current.id,
            models.Job.status.in_(("queued", "running")),
        )
        .first()
    )
    if ativo:
        raise HTTPException(
            status_code=409,
            detail="Robô ocupado: já existe uma execução em andamento ou na fila.",
        )

    receita = _carregar_receita(db, payload.receita_id)
    if not receita or receita.dono_id != current.id:
        raise HTTPException(status_code=404, detail="Receita não encontrada.")

    itens_mapeados, faltam_map, faltam_cal = _resolver_mapeamento(db, current.id, receita.ingredientes)

    if faltam_map:
        faltam_map = sorted(set(faltam_map), key=str.lower)
        raise HTTPException(
            status_code=409,
            detail=f"Mapeamento ausente: defina os frascos para {', '.join(faltam_map)} na aba Robô.",
        )
    if faltam_cal:
        faltam_cal = sorted(set(faltam_cal), key=str.lower)
        raise HTTPException(
            status_code=409,
            detail=f"Calibração pendente (g/s) para: {', '.join(faltam_cal)}. Preencha na aba Robô.",
        )

    # consumo por frasco (em g) considerando o multiplicador (apenas para validação)
    consumo_por_frasco = {}
    for frasco, _nome, q_g, _gps in itens_mapeados:
        consumo_por_frasco[frasco] = consumo_por_frasco.get(frasco, 0.0) + (q_g * payload.multiplicador)

    # valida estoque conhecido (None = desconhecido → não bloqueia)
    for frasco, consumo in consumo_por_frasco.items():
        cfg = (
            db.query(models.ReservatorioConfig)
            .filter(models.ReservatorioConfig.user_id == current.id, models.ReservatorioConfig.frasco == frasco)
            .first()
        )
        if cfg and cfg.estoque_g is not None and cfg.estoque_g < consumo:
            raise HTTPException(
                status_code=409,
                detail=f"Estoque insuficiente no Reservatório {frasco}: precisa {consumo} g, tem {cfg.estoque_g} g",
            )

    # cria job + itens (NÃO abate estoque aqui!)
    job = models.Job(
        user_id=current.id,
        receita_id=receita.id,
        status="queued",
        multiplicador=payload.multiplicador,
    )
    db.add(job)
    db.flush()

    ordem = 1
    for frasco, nome, q_g, gps in itens_mapeados:
        total_g = float(q_g * payload.multiplicador)
        segundos = round(total_g / float(gps), 3) if gps > 0 else 0.0

        db.add(
            models.JobItem(
                job_id=job.id,
                ordem=ordem,
                frasco=frasco,
                tempero=nome,
                quantidade_g=total_g,
                segundos=segundos,
                status="queued",
            )
        )
        ordem += 1

    db.commit()
    db.refresh(job)
    job = (
        db.query(models.Job)
        .options(selectinload(models.Job.itens))
        .filter(models.Job.id == job.id)
        .first()
    )
    return job


@app.get("/jobs/{job_id}", response_model=schemas.JobOut)
def obter_job(
    job_id: int,
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = (
        db.query(models.Job)
        .options(selectinload(models.Job.itens))
        .filter(models.Job.id == job_id, models.Job.user_id == current.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado.")
    return job


# ---------------------------------------------------------------------
# Dispositivos: claim / heartbeat / polling de job
# ---------------------------------------------------------------------
@app.post("/devices/claims", response_model=schemas.DeviceClaimOut)
def create_device_claim(
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # gera código 6 dígitos, expira em 10 minutos
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    while True:
        code = f"{randint(0, 999999):06d}"
        exists = db.query(models.DeviceClaim).filter(models.DeviceClaim.code == code).first()
        if not exists:
            break
    row = models.DeviceClaim(user_id=current.id, code=code, expires_at=expires)
    db.add(row)
    db.commit()
    return schemas.DeviceClaimOut(code=code, expires_at=expires)


@app.post("/devices/claim")
def device_claim(payload: schemas.DeviceClaimIn, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    claim = (
        db.query(models.DeviceClaim)
        .filter(
            models.DeviceClaim.code == payload.claim_code,
            models.DeviceClaim.used_at.is_(None),
            models.DeviceClaim.expires_at > now,
        )
        .first()
    )
    if not claim:
        raise HTTPException(status_code=400, detail="Código inválido ou expirado.")

    # upsert por UID do device (ex.: chipId)
    dev = db.query(models.Device).filter(models.Device.uid == payload.uid).first()
    if not dev:
        dev = models.Device(uid=payload.uid, user_id=claim.user_id)
        db.add(dev)
        db.flush()
    else:
        dev.user_id = claim.user_id  # reatribui (caso o mesmo HW troque de dono)

    dev.fw_version = payload.fw_version
    dev.last_seen = now

    claim.used_at = now
    db.commit()

    token = create_device_token(dev.id)
    return {"device_id": dev.id, "device_token": token, "heartbeat_sec": 30}


@app.post("/devices/me/heartbeat")
def device_heartbeat(
    data: schemas.HeartbeatIn,
    dev: models.Device = Depends(get_current_device),
    db: Session = Depends(get_db),
):
    dev.last_seen = datetime.now(timezone.utc)
    if data.fw_version:
        dev.fw_version = data.fw_version
    if data.status is not None:
        dev.status_json = json.dumps(data.status)
    db.commit()
    return {"ok": True}


@app.get("/devices/me/next_job", response_model=schemas.JobOut, responses={204: {"description": "Sem job"}})
def device_next_job(
    dev: models.Device = Depends(get_current_device),
    db: Session = Depends(get_db),
):
    job = (
        db.query(models.Job)
        .options(selectinload(models.Job.itens), selectinload(models.Job.receita))
        .join(models.Receita, models.Receita.id == models.Job.receita_id)
        .filter(models.Receita.dono_id == dev.user_id, models.Job.status == "queued")
        .order_by(models.Job.id.asc())
        .first()
    )
    if not job:
        return Response(status_code=204)

    job.status = "running"
    job.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    return job


@app.post("/devices/me/jobs/{job_id}/status")
def device_job_status(
    job_id: int,
    payload: schemas.JobStatusIn,
    dev: models.Device = Depends(get_current_device),
    db: Session = Depends(get_db),
):
    job = (
        db.query(models.Job)
        .options(selectinload(models.Job.itens), selectinload(models.Job.receita))
        .filter(models.Job.id == job_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado.")

    # garante que o job é do mesmo usuário do dispositivo
    dono_id = job.receita.dono_id if job.receita else job.user_id
    if dono_id != dev.user_id:
        raise HTTPException(status_code=403, detail="Job não pertence a este usuário/dispositivo.")

    now = datetime.now(timezone.utc)
    if payload.status == "running":
        job.status = "running"
        if not job.started_at:
            job.started_at = now
    elif payload.status == "done":
        job.status = "done"
        job.finished_at = now

        # >>> ABATE ESTOQUE AQUI (após execução bem-sucedida) <<<
        consumo_por_frasco = {}
        for it in job.itens:
            consumo_por_frasco[it.frasco] = consumo_por_frasco.get(it.frasco, 0.0) + float(it.quantidade_g or 0)
        for frasco, total_g in consumo_por_frasco.items():
            cfg = (
                db.query(models.ReservatorioConfig)
                .filter(
                    models.ReservatorioConfig.user_id == dev.user_id,
                    models.ReservatorioConfig.frasco == frasco,
                )
                .first()
            )
            if cfg and cfg.estoque_g is not None:
                cfg.estoque_g = max(0.0, float(cfg.estoque_g) - float(total_g))
    else:
        job.status = "failed"
        job.finished_at = now
        job.erro_msg = payload.error or "erro não especificado"

    db.commit()
    return {"ok": True}

# ---------------------------------------------------------------------
# Utilitários: devices do usuário e controle do job ativo
# ---------------------------------------------------------------------

def _ensure_aware_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Normaliza datetimes: se vier naive, assume UTC; se vier com tz, converte para UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def _is_online(dev: models.Device) -> bool:
    last = _ensure_aware_utc(dev.last_seen)
    if not last:
        return False
    try:
        return (datetime.now(timezone.utc) - last) <= timedelta(seconds=90)
    except Exception:
        # Nunca derrube o endpoint por dados ruins
        return False

def _list_user_devices(db: Session, user_id: int):
    rows = db.query(models.Device).filter(models.Device.user_id == user_id).all()
    out: List[Dict] = []
    for d in rows:
        out.append({
            "id": d.id,
            "uid": d.uid,
            "fw_version": d.fw_version,
            "last_seen": _ensure_aware_utc(d.last_seen),
            "online": _is_online(d),
        })
    return {"devices": out, "online_any": any(x["online"] for x in out)}

@app.get("/me/devices")
def my_devices(
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _list_user_devices(db, current.id)

# Alias para compatibilidade: alguns front-ends chamam /devices
@app.get("/devices")
def devices_alias(
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _list_user_devices(db, current.id)

@app.get("/jobs/active")
def jobs_active(
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = (
        db.query(models.Job)
        .filter(models.Job.user_id == current.id, models.Job.status.in_(("queued", "running")))
        .order_by(models.Job.id.asc())
        .first()
    )
    if not job:
        return {"active": None}
    return {"active": {"id": job.id, "status": job.status, "started_at": job.started_at}}

@app.post("/jobs/active/cancel")
def cancel_active_job(
    current: models.Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    jobs = (
        db.query(models.Job)
        .filter(models.Job.user_id == current.id, models.Job.status.in_(("queued", "running")))
        .all()
    )
    now = datetime.now(timezone.utc)
    count = 0
    for j in jobs:
        j.status = "failed"
        j.finished_at = now
        j.erro_msg = "cancelado pelo usuário"
        count += 1
    db.commit()
    return {"ok": True, "cancelled": count}
