from pydantic import BaseModel, Field


class LobbyDto(BaseModel):
    train_id: int

    class Config:
        from_attributes = True


class BookingDto(BaseModel):
    train_id: int 
    user_credentials: str = Field(..., max_length=100)
