from pydantic import BaseModel, Field


class LobbyDto(BaseModel):
    train_id: int


class BookingDto(BaseModel):
    train_id: int 
    user_credentials: str = Field(..., max_length=100)
