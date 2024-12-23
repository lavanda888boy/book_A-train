from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from typing import List
from db.models import Lobby
from db.schemas import LobbyBaseDto, LobbyInfoDto, BookingDto
from db.database import get_db
from sqlalchemy.orm import Session
from utils.rabbitmq import RabbitMQ, get_rabbitmq
from management.lobby_manager import LobbyManager, get_lobby_manager

import asyncio
import threading
import requests
import os

router = APIRouter()

BOOKINGS_SERVICE_URL = os.getenv("BOOKINGS_SERVICE_URL")


@router.get("/status")
def status():
    return JSONResponse(content={"status": "OK", "message": "Lobby service is running"})


@router.post("/lobbies")
def create_lobby(lobby: LobbyBaseDto, lobby_manager: LobbyManager = Depends(get_lobby_manager)):
    return lobby_manager.create(lobby)


@router.get("/lobbies", response_model=List[LobbyInfoDto])
def get_all_lobbies(lobby_manager: LobbyManager = Depends(get_lobby_manager)):
    return lobby_manager.get_all()


@router.get("/lobbies/{lobby_id}", response_model=LobbyInfoDto)
def get_lobby_by_id(lobby_id: int, lobby_manager: LobbyManager = Depends(get_lobby_manager)):
    return lobby_manager.get_by_id(lobby_id)


@router.delete("/lobbies/{lobby_id}")
def delete_lobby_by_id(lobby_id: int, lobby_manager: LobbyManager = Depends(get_lobby_manager)):
    return lobby_manager.delete(lobby_id)


active_connections = {}


@router.websocket("/lobbies/ws/{lobby_id}")
async def websocket_lobby(websocket: WebSocket, lobby_id: int, db: Session = Depends(get_db),
                          rabbitmq: RabbitMQ = Depends(get_rabbitmq)):
    lobby = db.query(Lobby).filter(Lobby.train_id == lobby_id).first()

    if lobby is None:
        await websocket.close(code=1008)
        raise HTTPException(
            status_code=404, detail="Lobby for this train not found")

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
        asyncio.run_coroutine_threadsafe(
            broadcast_message_to_lobby(message), loop)

    thread = threading.Thread(target=rabbitmq.consume_messages, args=(
        str(lobby_id), rabbitmq_callback), daemon=True)
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


@router.post("/start-booking")
def start_booking_registration(booking: BookingDto):
    try:
        response = requests.post(BOOKINGS_SERVICE_URL,
                                 json=booking.model_dump())
        response.raise_for_status()

        return {"message": "Booking registered successfully", "booking_id": response.content}

    except requests.exceptions.HTTPError:
        raise HTTPException(
            status_code=response.status_code, detail=response.text)
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))
