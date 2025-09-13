from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    ForeignKey,
    UniqueConstraint,
    DateTime,
    func,
)
from sqlalchemy.orm import relationship
from .database import Base


class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(80), unique=True, index=True, nullable=False)
    senha_hash = Column(String(255), nullable=False)
    receitas = relationship("Receita", back_populates="dono")


class Receita(Base):
    __tablename__ = "receitas"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(120), nullable=False)
    dono_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    dono = relationship("Usuario", back_populates="receitas")
    ingredientes = relationship(
        "IngredienteReceita",
        cascade="all, delete-orphan",
        back_populates="receita",
    )


class IngredienteReceita(Base):
    __tablename__ = "ingredientes_receita"
    id = Column(Integer, primary_key=True)
    receita_id = Column(Integer, ForeignKey("receitas.id"), index=True, nullable=False)
    # nome do tempero (ex.: "sal", "pimenta")
    tempero = Column(String(60), nullable=False)
    # número do reservatório físico
    frasco = Column(Integer, nullable=False)
    # gramas
    quantidade = Column(Float, nullable=False)

    receita = relationship("Receita", back_populates="ingredientes")
    __table_args__ = (
        # evita duplicar o mesmo frasco na mesma receita
        UniqueConstraint("receita_id", "frasco", name="uq_receita_frasco"),
    )


# =============== NOVO: configuração por reservatório (por usuário) ===============
class ReservatorioConfig(Base):
    __tablename__ = "reservatorio_config"
    __table_args__ = (
        UniqueConstraint("user_id", "frasco", name="uq_user_frasco"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    frasco = Column(Integer, nullable=False)           # 1..4
    rotulo = Column(String(80), nullable=True)         # ex.: "Pimenta"
    conteudo = Column(String(120), nullable=True)      # ex.: "moída", opcional
    g_por_seg = Column(Float, nullable=True)           # calibração (g/s), opcional
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    dono = relationship("Usuario", backref="reservatorio_configs")
