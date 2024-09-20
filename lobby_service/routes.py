from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from typing import List
from pymongo.database import Database
from db.models import Lobby, Booking
from db.init_db import get_database

router = APIRouter()


@router.get("/status")
def status():
    return JSONResponse(content={"status": "OK", "message": "Service is running"})


@router.post("/lobbies")
def create_lobby(lobby: Lobby, db: Database = Depends(get_database)):
    existing_lobby = db["lobbies"].find_one({"train_id": lobby.train_id})

    if existing_lobby:
        raise HTTPException(status_code=400, detail="Lobby with this train_id already exists")

    db_lobby = db["lobbies"].insert_one(lobby.model_dump())

    return {"_id": str(db_lobby.inserted_id)}


@router.get("/lobbies", response_model=List[Lobby])
def get_all_lobbies(db: Database = Depends(get_database)):
    return list(db["lobbies"].find())


@router.get("/lobbies/{lobby_id}", response_model=Lobby)
def get_lobby_by_id(lobby_id: int, db: Database = Depends(get_database)):
    db_lobby = db["lobbies"].find_one({"train_id": lobby_id})

    if db_lobby is None:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    return db_lobby


@router.delete("/lobbies/{lobby_id}")
def delete_train_by_id(lobby_id: int, db: Database = Depends(get_database)):
    result = db["lobbies"].delete_one({"train_id": lobby_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lobby to delete not found")

    return {"message": "Lobby deleted successfully", "lobby_id": lobby_id}