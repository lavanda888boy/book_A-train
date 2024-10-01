from fastapi import Depends, HTTPException
from db.models import Lobby
from db.schemas import LobbyBaseDto, LobbyInfoDto
from db.database import get_db
from sqlalchemy.orm import Session
from utils.redis_cache import get_redis_client

import redis
import json


class LobbyManager:

    def __init__(self, db: Session, redis_cache: redis.Redis):
        self.db = db
        self.redis_cache = redis_cache


    def create(self, lobby: LobbyBaseDto):
        existing_lobby = self.db.query(Lobby).filter(Lobby.train_id == lobby.train_id).first()

        if existing_lobby:
            raise HTTPException(status_code=400, detail="Lobby with this train_id already exists")

        db_lobby = Lobby(train_id=lobby.train_id)

        self.db.add(db_lobby)
        self.db.commit()
        self.db.refresh(db_lobby)

        return db_lobby.id
    

    def get_all(self):
        cached_lobbies = self.redis_cache.get("lobbies")

        if cached_lobbies:
            return json.loads(cached_lobbies)
        else:
            lobbies = self.db.query(Lobby).all()
            lobby_dtos = [LobbyInfoDto.model_validate(lobby) for lobby in lobbies]
            self.redis_cache.setex(name="lobbies", time=60, value=json.dumps([lobby.model_dump() for lobby in lobby_dtos]))
            return lobby_dtos
        
    
    def get_by_id(self, lobby_id: int):
        db_lobby = self.db.query(Lobby).filter(Lobby.id == lobby_id).first()

        if db_lobby is None:
            raise HTTPException(status_code=404, detail="Lobby not found")
        
        return db_lobby
    

    def delete(self, lobby_id: int):
        db_lobby = self.db.query(Lobby).filter(Lobby.id == lobby_id).first()

        if db_lobby is None:
            raise HTTPException(status_code=404, detail="Lobby to delete not found")

        self.db.delete(db_lobby)
        self.db.commit()

        return db_lobby.id


def get_lobby_manager(
    db: Session = Depends(get_db), 
    redis_cache: redis.Redis = Depends(get_redis_client)
) -> LobbyManager:
    return LobbyManager(db, redis_cache)