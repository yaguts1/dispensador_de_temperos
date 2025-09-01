from sqlalchemy import Column, Integer, String, ForeignKey, Float
from sqlalchemy.orm import relationship
from .database import Base

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, unique=True, index=True)
    senha = Column(String)

    receitas = relationship("Receita", back_populates="dono")

class Receita(Base):
    __tablename__ = "receitas"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String)
    dono_id = Column(Integer, ForeignKey("usuarios.id"))

    dono = relationship("Usuario", back_populates="receitas")
    ingredientes = relationship("IngredienteReceita", back_populates="receita")

class IngredienteReceita(Base):
    __tablename__ = "ingredientes_receita"

    id = Column(Integer, primary_key=True, index=True)
    receita_id = Column(Integer, ForeignKey("receitas.id"))
    frasco = Column(Integer)  # 1 a 4
    quantidade = Column(Float)

    receita = relationship("Receita", back_populates="ingredientes")
