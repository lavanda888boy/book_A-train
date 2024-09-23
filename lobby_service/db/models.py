from sqlalchemy import Column, Integer, CheckConstraint
from .database import Base


class Lobby(Base):
    __tablename__ = 'lobbies'

    id = Column(Integer, primary_key=True, index=True)
    train_id = Column(Integer, nullable=False) 

    __table_args__ = (
        CheckConstraint('train_id > 0', name='check_train_id_min'),
    )