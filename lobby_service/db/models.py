from pydantic import BaseModel, Field
from typing import Optional


class Lobby(BaseModel):
    train_id: int
    status: str = Field('active')


class Booking(BaseModel):
    train_id: int 
    user_credentials: str = Field(..., max_length=100)
