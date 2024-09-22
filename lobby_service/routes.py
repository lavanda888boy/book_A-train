from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from typing import List
from pymongo.database import Database
from db.models import Lobby, Booking
from db.init_db import get_database
from rabbitmq import RabbitMQ, get_rabbitmq

import asyncio
import threading

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
def delete_lobby_by_id(lobby_id: int, db: Database = Depends(get_database)):
    result = db["lobbies"].delete_one({"train_id": lobby_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lobby to delete not found")

    return {"message": "Lobby deleted successfully", "lobby_id": lobby_id}


active_connections = {}

@router.websocket("/lobbies/ws/{lobby_id}")
async def websocket_lobby(websocket: WebSocket, lobby_id: int, rabbitmq: RabbitMQ = Depends(get_rabbitmq)):
    db: Database = get_database()
    lobby = db["lobbies"].find_one({"train_id": lobby_id})

    if lobby is None:
        await websocket.close(code=1008)
        raise HTTPException(status_code=404, detail="Lobby for this train not found")

    await websocket.accept()

    welcome_message = f"Welcome to the train lobby {lobby_id}!"
    await websocket.send_text(welcome_message)

    if lobby_id not in active_connections:
        active_connections[lobby_id] = []
    active_connections[lobby_id].append(websocket)

    loop = asyncio.get_event_loop()

    async def broadcast_message_to_lobby(message: str):
        for connection in active_connections[lobby_id]:
            await connection.send_text(message)

    def rabbitmq_callback(message: str):
        asyncio.run_coroutine_threadsafe(broadcast_message_to_lobby(message), loop)

    thread = threading.Thread(target=rabbitmq.consume_messages, args=(str(lobby_id), rabbitmq_callback), daemon=True)
    thread.start()

    try:
        while True:
            data = await websocket.receive_text()

            for connection in active_connections[lobby_id]:
                if connection != websocket:
                    await connection.send_text(data)

    except WebSocketDisconnect:
        active_connections[lobby_id].remove(websocket)

        if len(active_connections[lobby_id]) == 0:
            del active_connections[lobby_id]