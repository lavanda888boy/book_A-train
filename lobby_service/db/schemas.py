from pydantic import BaseModel, Field


class LobbyBaseDto(BaseModel):
    train_id: int


class LobbyInfoDto(LobbyBaseDto):
    id: int

    class Config:
        from_attributes = True


class BookingDto(BaseModel):
    train_id: int 
    user_credentials: str = Field(..., max_length=100)
