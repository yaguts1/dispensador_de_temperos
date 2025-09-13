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


# =========================
# Usuários
# =========================
class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(80), unique=True, index=True, nullable=False)
    senha_hash = Column(String(255), nullable=False)

    receitas = relationship("Receita", back_populates="dono")
    jobs = relationship("Job", back_populates="dono")


# =========================
# Receitas
# =========================
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
        order_by="IngredienteReceita.id.asc()",
    )


class IngredienteReceita(Base):
    __tablename__ = "ingredientes_receita"
    id = Column(Integer, primary_key=True)
    receita_id = Column(Integer, ForeignKey("receitas.id"), index=True, nullable=False)

    # nome do tempero (ex.: "sal", "pimenta")
    tempero = Column(String(60), nullable=False)

    # gramas (inteiro 1..500; validado na camada de API)
    quantidade = Column(Float, nullable=False)

    receita = relationship("Receita", back_populates="ingredientes")


# =========================
# Configuração por reservatório (por usuário)
# =========================
class ReservatorioConfig(Base):
    __tablename__ = "reservatorio_config"
    __table_args__ = (UniqueConstraint("user_id", "frasco", name="uq_user_frasco"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    frasco = Column(Integer, nullable=False)  # 1..4
    # rótulo = nome do tempero contido
    rotulo = Column(String(80), nullable=True)  # ex.: "Pimenta"
    conteudo = Column(String(120), nullable=True)  # ex.: "moída", opcional
    g_por_seg = Column(Float, nullable=True)  # calibração (g/s), opcional > 0
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    dono = relationship("Usuario", backref="reservatorio_configs")


# =========================
# Jobs (fila de execução)
# =========================
class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), index=True, nullable=False)
    receita_id = Column(Integer, ForeignKey("receitas.id", ondelete="SET NULL"), nullable=True, index=True)

    status = Column(String(20), nullable=False, default="queued", index=True)  # queued|running|done|failed|canceled
    multiplicador = Column(Integer, nullable=False, default=1)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    # futuro: device_id/mac, logs etc.
    erro_msg = Column(String(255), nullable=True)

    dono = relationship("Usuario", back_populates="jobs")
    receita = relationship("Receita")
    itens = relationship(
        "JobItem",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="JobItem.ordem.asc()",
    )


class JobItem(Base):
    __tablename__ = "job_items"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), index=True, nullable=False)

    # ordem de execução 1..N
    ordem = Column(Integer, nullable=False)

    # resolução do mapeamento dinâmico:
    frasco = Column(Integer, nullable=False)  # 1..4
    tempero = Column(String(60), nullable=False)

    # pedido
    quantidade_g = Column(Float, nullable=False)  # em gramas
    segundos = Column(Float, nullable=False)      # tempo a rodar (s), calculado via g/s

    status = Column(String(20), nullable=False, default="queued")  # queued|running|done|failed
    erro_msg = Column(String(255), nullable=True)

    job = relationship("Job", back_populates="itens")
