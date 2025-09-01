from pydantic import BaseModel
from typing import List

class IngredienteBase(BaseModel):
    frasco: int
    quantidade: float

class ReceitaBase(BaseModel):
    nome: str
    ingredientes: List[IngredienteBase]

class ReceitaCreate(ReceitaBase):
    pass

class Receita(ReceitaBase):
    id: int
    class Config:
        orm_mode = True

class UsuarioBase(BaseModel):
    nome: str

class UsuarioCreate(UsuarioBase):
    senha: str

class Usuario(UsuarioBase):
    id: int
    class Config:
        orm_mode = True
