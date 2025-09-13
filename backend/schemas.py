from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, ConfigDict


# =========================
# Ingredientes / Receitas
# =========================
class IngredienteBase(BaseModel):
    tempero: str = Field(..., min_length=1, max_length=60)
    # aceita decimais com precisão de 0.1g (internamente arredondamos p/ inteiro)
    quantidade: float = Field(..., gt=0, le=500, multiple_of=0.1)

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
    def _entre_um_e_quatro(cls, itens: List[IngredienteBase]) -> List[IngredienteBase]:
        if not (1 <= len(itens) <= 4):
            raise ValueError("A receita deve ter entre 1 e 4 ingredientes.")
        return itens


class ReceitaCreate(ReceitaBase):
    pass


class Ingrediente(IngredienteBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class Receita(ReceitaBase):
    id: int
    ingredientes: List[Ingrediente]
    model_config = ConfigDict(from_attributes=True)


# =========================
# Usuários
# =========================
class UsuarioBase(BaseModel):
    nome: str


class UsuarioCreate(UsuarioBase):
    senha: str


class Usuario(UsuarioBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class SugestaoReceita(BaseModel):
    id: int
    nome: str
    model_config = ConfigDict(from_attributes=True)


class LoginInput(BaseModel):
    nome: str = Field(..., min_length=1, max_length=80)
    senha: str = Field(..., min_length=1)


class UsuarioPublic(BaseModel):
    id: int
    nome: str
    model_config = ConfigDict(from_attributes=True)


# =========================
# Configuração do Robô (por usuário)
# =========================
class ReservatorioConfigIn(BaseModel):
    frasco: int = Field(..., ge=1, le=4)
    # o rótulo deve ser o nome do tempero contido
    rotulo: Optional[str] = Field(default=None, max_length=80)
    conteudo: Optional[str] = Field(default=None, max_length=120)
    g_por_seg: Optional[float] = Field(default=None, gt=0)


class ReservatorioConfigOut(ReservatorioConfigIn):
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


# =========================
# Jobs
# =========================
class JobCreateIn(BaseModel):
    receita_id: int
    multiplicador: int = Field(1, ge=1)


class JobItemOut(BaseModel):
    id: int
    ordem: int
    frasco: int
    tempero: str
    quantidade_g: float
    segundos: float
    status: str
    model_config = ConfigDict(from_attributes=True)


class JobOut(BaseModel):
    id: int
    status: str
    receita_id: Optional[int] = None
    multiplicador: int
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    erro_msg: Optional[str] = None
    itens: List[JobItemOut] = []
    model_config = ConfigDict(from_attributes=True)
