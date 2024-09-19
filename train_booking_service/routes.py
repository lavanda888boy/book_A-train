from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from db.models import Train, Booking
from schemas import TrainBaseDto, TrainInfoDto, TrainUpdateDto, BookingBaseDto, BookingInfoDto
from db.database import get_db

from typing import List

router = APIRouter()

@router.get("/status")
def status():
    return JSONResponse(content={"status": "OK", "message": "Service is running"})


@router.post("/trains")
def register_train(train: TrainBaseDto, db: Session = Depends(get_db)):
    db_train = Train(route=train.route, departure_time=train.departure_time,
                        arrival_time=train.arrival_time, available_seats=train.available_seats)
    
    db.add(db_train)
    db.commit()
    db.refresh(db_train)

    return db_train.id


@router.get("/trains", response_model=List[TrainInfoDto])
def get_all_trains(db: Session = Depends(get_db)):
    return db.query(Train).all()


@router.get("/trains/{train_id}", response_model=TrainInfoDto)
def get_train_by_id(train_id: int, db: Session = Depends(get_db)):
    db_train = db.query(Train).filter(Train.id == train_id).first()

    if db_train is None:
        raise HTTPException(status_code=404, detail="Train not found")
    
    return db_train


@router.put("/trains/{train_id}")
def update_train(train_id: int, updated_train: TrainUpdateDto, db: Session = Depends(get_db)):
    db_train = db.query(Train).filter(Train.id == train_id).first()

    if db_train is None:
        raise HTTPException(status_code=404, detail="Train to update not found")
    
    if updated_train.route is not None:
        db_train.route = updated_train.route
    if updated_train.departure_time is not None:
        db_train.departure_time = updated_train.departure_time
    if updated_train.arrival_time is not None:
        db_train.arrival_time = updated_train.arrival_time
    if updated_train.available_seats is not None:
        db_train.available_seats = updated_train.available_seats

    db.commit()
    db.refresh(db_train)
    
    return db_train.id


@router.delete("/trains/{train_id}")
def delete_train_by_id(train_id: int, db: Session = Depends(get_db)):
    db_train = db.query(Train).filter(Train.id == train_id).first()

    if db_train is None:
        raise HTTPException(status_code=404, detail="Train to delete not found")
    
    db.delete(db_train)
    db.commit()

    return db_train.id


@router.post("/bookings")
def register_booking(booking: BookingBaseDto, db: Session = Depends(get_db)):
    db_train = db.query(Train).filter(Train.id == booking.train_id).first()

    if db_train is None:
        raise HTTPException(status_code=404, detail="Train to book ticket for not found")
    
    db_train.available_seats -= 1
    if db_train.available_seats == 0:
        db.delete(db_train)
    else:
        db.commit()
        db.refresh(db_train)

    db_booking = Booking(train_id=booking.train_id, user_credentials=booking.user_credentials)

    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)

    return db_booking.id


@router.get("/bookings", response_model=List[BookingInfoDto])
def get_all_bookings(db: Session = Depends(get_db)):
    return db.query(Booking).all()


@router.get("/bookings/{booking_id}", response_model=BookingInfoDto)
def get_booking_by_id(booking_id: int, db: Session = Depends(get_db)):
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()

    if db_booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    return db_booking


@router.delete("/bookings/{booking_id}")
def delete_booking_by_id(booking_id: int, db: Session = Depends(get_db)):
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()

    if db_booking is None:
        raise HTTPException(status_code=404, detail="Booking to delete not found")
    
    db_train = db.query(Train).filter(Train.id == db_booking.train_id).first()
    db_train.available_seats += 1
    
    db.delete(db_booking)
    db.commit()

    return db_booking.id  