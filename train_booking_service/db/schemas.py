from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class DbUpdateDto(BaseModel):
    master_db: str = Field(..., max_length=200)
    slave_dbs: List[str] = Field(..., max_items=10)


class TrainBaseDto(BaseModel):
    route: str = Field(..., max_length=100)
    departure_time: datetime
    arrival_time: datetime
    available_seats: int = Field(..., ge=0, le=400)

    class Config:
        from_attributes = True


class TrainUpdateDto(BaseModel):
    route: Optional[str] = Field(None, max_length=100)
    departure_time: Optional[datetime] = None
    arrival_time: Optional[datetime] = None
    available_seats: Optional[int] = Field(None, ge=0, le=400)


class TrainInfoDto(TrainBaseDto):
    id: int


class BookingBaseDto(BaseModel):
    train_id: int
    user_credentials: str = Field(..., max_length=100)

    class Config:
        from_attributes = True


class BookingUpdateDto(BaseModel):
    user_credentials: str = Field(..., max_length=100)


class BookingInfoDto(BookingBaseDto):
    id: int
