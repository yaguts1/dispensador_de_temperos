from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    ForeignKey,
    UniqueConstraint,
    DateTime,
    Text,
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
    
    # Porção base: para quantas pessoas é a receita (1-20)
    porcoes = Column(Integer, nullable=False, default=1)

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

    # gramas (inteiro 1..500 na API; aqui mantemos float por compat)
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

    # rótulo = nome do tempero contido (controlado pelo catálogo)
    rotulo = Column(String(80), nullable=True)

    # calibração (g/s), opcional > 0
    g_por_seg = Column(Float, nullable=True)

    # ESTOQUE atual do frasco em gramas (None = desconhecido)
    estoque_g = Column(Float, nullable=True)

    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    dono = relationship("Usuario", backref="reservatorio_configs")


# =========================
# Dispositivos (ESP32)
# =========================
class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    uid = Column(String(64), nullable=False, unique=True, index=True)  # ex.: chipId
    name = Column(String(120), nullable=True)
    fw_version = Column(String(32), nullable=True)
    status_json = Column(Text, nullable=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("Usuario", backref="devices")


class DeviceClaim(Base):
    __tablename__ = "device_claims"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(6), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("Usuario")


# =========================
# Jobs (fila de execução)
# =========================
class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), index=True, nullable=False)
    receita_id = Column(Integer, ForeignKey("receitas.id", ondelete="SET NULL"), nullable=True, index=True)

    status = Column(String(20), nullable=False, default="queued", index=True)  # queued|running|done|failed|canceled
    multiplicador = Column(Integer, nullable=False, default=1)  # DEPRECATED: usar pessoas_solicitadas
    
    # Escalamento baseado em porções
    pessoas_solicitadas = Column(Integer, nullable=False, default=1)  # Para quantas pessoas executar

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    # ===== NOVAS COLUNAS para offline-first model =====
    itens_completados = Column(Integer, nullable=True)   # quantos itens completaram com sucesso
    itens_falhados = Column(Integer, nullable=True)      # quantos falharam
    execution_report = Column(Text, nullable=True)       # JSON array com log per-frasco
    # =================================================

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
