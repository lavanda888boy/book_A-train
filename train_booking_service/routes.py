from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.models import Train, Booking
from schemas import TrainRegistrationDto, TrainInfoDto
from db.database import get_db

from typing import List

router = APIRouter()

@router.post("/trains/")
def register_train(train: TrainRegistrationDto, db: Session = Depends(get_db)):
    db_train = Train(train.route, train.departure_time, train.arrival_time, train.available_seats)
    
    db.add(db_train)
    db.commit()
    db.refresh(db_train)

    return db_train.id


@router.get("/trains/", response_model=List[TrainInfoDto])
def get_all_trains(db: Session = Depends(get_db)):
    return db.query(Train).all()


@router.get("/trains/{train_id}", response_model=TrainInfoDto)
def get_train_by_id(train_id: int, db: Session = Depends(get_db)):
    db_train = db.query(Train).filter(Train.id == train_id).first()

    if db_train is None:
        raise HTTPException(status_code=404, detail="Train not found")
    
    return db_train
