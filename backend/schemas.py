from typing import List
from pydantic import BaseModel, Field, field_validator, ConfigDict

# ---------------------------
# Ingredientes / Receitas
# ---------------------------

class IngredienteBase(BaseModel):
    tempero: str = Field(..., min_length=1, max_length=60)
    frasco: int = Field(..., ge=1, le=4)
    # aceita decimais com precisão de 0.1g
    quantidade: float = Field(..., gt=0, le=500, multiple_of=0.1)

    # normaliza/valida o texto do tempero
    @field_validator("tempero")
    @classmethod
    def _strip_tempero(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("O nome do tempero não pode ser vazio.")
        return v

class ReceitaBase(BaseModel):
    nome: str = Field(..., min_length=1, max_length=120)
    ingredientes: List[IngredienteBase]

    @field_validator("ingredientes")
    @classmethod
    def _max_quatro(cls, itens: List[IngredienteBase]) -> List[IngredienteBase]:
        if not (1 <= len(itens) <= 4):
            raise ValueError("A receita deve ter entre 1 e 4 ingredientes.")
        return itens

class ReceitaCreate(ReceitaBase):
    pass

class Ingrediente(IngredienteBase):
    id: int
    # Pydantic v2
    model_config = ConfigDict(from_attributes=True)

class Receita(ReceitaBase):
    id: int
    ingredientes: List[Ingrediente]
    model_config = ConfigDict(from_attributes=True)

# ---------------------------
# Usuários
# ---------------------------

class UsuarioBase(BaseModel):
    nome: str

class UsuarioCreate(UsuarioBase):
    senha: str

class Usuario(UsuarioBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
