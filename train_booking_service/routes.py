from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from db.schemas import TrainBaseDto, TrainInfoDto, TrainUpdateDto, BookingBaseDto, BookingInfoDto, BookingUpdateDto
from management.train_manager import TrainManager, get_train_manager
from management.booking_manager import BookingManager, get_booking_manager
from typing import List

router = APIRouter()

@router.get("/status")
def status():
    return JSONResponse(content={"status": "OK", "message": "Train booking service is running"})


@router.post("/trains")
def register_train(train: TrainBaseDto, train_manager: TrainManager = Depends(get_train_manager)):
    return train_manager.create(train)


@router.get("/trains", response_model=List[TrainInfoDto])
def get_all_trains(train_manager: TrainManager = Depends(get_train_manager)):
    return train_manager.get_all()


@router.get("/trains/{train_id}", response_model=TrainInfoDto)
def get_train_by_id(train_id: int, train_manager: TrainManager = Depends(get_train_manager)):
    return train_manager.get_by_id(train_id)


@router.put("/trains/{train_id}")
def update_train_details(train_id: int, updated_train: TrainUpdateDto, train_manager: TrainManager = Depends(get_train_manager)):
    return train_manager.update(train_id, updated_train)


@router.delete("/trains/{train_id}")
def delete_train_by_id(train_id: int, train_manager: TrainManager = Depends(get_train_manager)):
    return train_manager.delete(train_id)


@router.post("/bookings")
def register_booking(booking: BookingBaseDto, booking_manager: BookingManager = Depends(get_booking_manager)):
    return booking_manager.create(booking)


@router.get("/bookings", response_model=List[BookingInfoDto])
def get_all_bookings(booking_manager: BookingManager = Depends(get_booking_manager)):
    return booking_manager.get_all()


@router.get("/bookings/{booking_id}", response_model=BookingInfoDto)
def get_booking_by_id(booking_id: int, booking_manager: BookingManager = Depends(get_booking_manager)):
    return booking_manager.get_by_id(booking_id)


@router.put("/bookings/{booking_id}")
def update_booking_details(booking_id: int, updated_booking: BookingUpdateDto, 
                           booking_manager: BookingManager = Depends(get_booking_manager)):
    return booking_manager.update(booking_id, updated_booking)


@router.delete("/bookings/{booking_id}")
def delete_booking_by_id(booking_id: int, booking_manager: BookingManager = Depends(get_booking_manager)):
    return booking_manager.delete(booking_id)  