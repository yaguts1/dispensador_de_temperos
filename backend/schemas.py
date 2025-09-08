from pydantic import BaseModel, Field, conint, confloat, validator
from typing import List, Optional

class IngredienteBase(BaseModel):
    tempero: str = Field(..., min_length=1, max_length=60)
    frasco: conint(ge=1, le=4)
    quantidade: confloat(gt=0, le=500)

class ReceitaBase(BaseModel):
    nome: str = Field(..., min_length=1, max_length=120)
    ingredientes: List[IngredienteBase]

    @validator("ingredientes")
    def max_quatro(cls, v):
        if not (1 <= len(v) <= 4):
            raise ValueError("A receita deve ter entre 1 e 4 ingredientes.")
        return v

class ReceitaCreate(ReceitaBase):
    pass

class Ingrediente(IngredienteBase):
    id: int
    class Config:
        orm_mode = True

class Receita(ReceitaBase):
    id: int
    ingredientes: List[Ingrediente]
    class Config:
        orm_mode = True

# Usuários
class UsuarioBase(BaseModel):
    nome: str

class UsuarioCreate(UsuarioBase):
    senha: str

class Usuario(UsuarioBase):
    id: int
    class Config:
        orm_mode = True
