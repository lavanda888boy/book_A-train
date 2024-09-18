from pydantic import BaseModel, Field
from datetime import time


class TrainBaseDto(BaseModel):
    route: str = Field(..., max_length=100)
    departure_time: time
    arrival_time: time
    available_seats: int = Field(..., ge=0, le=100)


class TrainInfoDto(TrainBaseDto):
    id: int
    
    class Config:
        from_attributes = True


class TrainRegistrationDto(TrainBaseDto):
    pass


class BookingBaseDto(BaseModel):
    train_id: int 
    user_id: int


class BookingInfoDto(BookingBaseDto):
    id: int

    class Config:
        from_attributes = True


class BookingProcessingDto(BookingBaseDto):
    pass
