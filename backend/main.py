from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from . import models, schemas, database

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="API Dispenser de Temperos")

# Dependência para criar sessão de banco
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def root():
    return {"message": "API do Dispenser de Temperos está no ar 🚀"}

@app.post("/usuarios/", response_model=schemas.Usuario)
def criar_usuario(usuario: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    db_usuario = models.Usuario(nome=usuario.nome, senha=usuario.senha)
    db.add(db_usuario)
    db.commit()
    db.refresh(db_usuario)
    return db_usuario

@app.post("/receitas/")
def criar_receita(receita: schemas.ReceitaCreate, db: Session = Depends(get_db)):
    db_receita = models.Receita(nome=receita.nome, dono_id=1)  # simplificado: dono fixo
    db.add(db_receita)
    db.commit()
    db.refresh(db_receita)

    for ing in receita.ingredientes:
        db_ing = models.IngredienteReceita(receita_id=db_receita.id,
                                           frasco=ing.frasco,
                                           quantidade=ing.quantidade)
        db.add(db_ing)
    db.commit()
    return {"status": "receita criada com sucesso"}
