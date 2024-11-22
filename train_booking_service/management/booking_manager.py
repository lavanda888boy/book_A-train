from fastapi import Depends, HTTPException
from db.models import Booking, Train
from db.schemas import BookingBaseDto, BookingInfoDto, BookingUpdateDto
from db.database import get_db
from sqlalchemy.orm import Session
from utils.redis_cache import get_redis_client
from utils.rabbitmq import RabbitMQ, get_rabbitmq

import redis
import json


class BookingManager:

    def __init__(self, master_db: Session, slave_db: Session, rabbitmq: RabbitMQ, redis_cache: redis.RedisCluster):
        self.master_db = master_db
        self.slave_db = slave_db
        self.rabbitmq = rabbitmq
        self.redis_cache = redis_cache

    def create(self, booking: BookingBaseDto):
        db_train = self.master_db.query(Train).filter(
            Train.id == booking.train_id).first()

        if db_train is None:
            raise HTTPException(
                status_code=404, detail="Train to book ticket for not found")

        existing_booking = self.slave_db.query(Booking).filter(
            Booking.train_id == booking.train_id,
            Booking.user_credentials == booking.user_credentials
        ).first()

        if existing_booking:
            raise HTTPException(
                status_code=400, detail="Booking already exists for this train and user")

        db_train.available_seats -= 1
        if db_train.available_seats == 0:
            message = f"A booking was registered for {
                booking.user_credentials}.\nThere are no more seats left.\n"
            self.rabbitmq.send_message_to_exchange(
                routing_key=str(db_train.id), message=message)
            self.master_db.delete(db_train)
        else:
            self.master_db.commit()
            self.master_db.refresh(db_train)

        db_booking = Booking(train_id=booking.train_id,
                             user_credentials=booking.user_credentials)

        self.master_db.add(db_booking)
        self.master_db.commit()
        self.master_db.refresh(db_booking)

        message = f"A booking was registered for {
            booking.user_credentials}.\nAvailable seats: {db_train.available_seats}\n"
        self.rabbitmq.send_message_to_exchange(
            routing_key=str(db_train.id), message=message)
        self.redis_cache.delete('bookings')

        return db_booking.id

    def get_all(self):
        bookings = self.redis_cache.get("bookings")

        if bookings:
            return json.loads(bookings)
        else:
            bookings = self.slave_db.query(Booking).all()
            booking_dtos = [BookingInfoDto.model_validate(
                booking) for booking in bookings]
            self.redis_cache.setex(name="bookings", time=120, value=json.dumps(
                [booking.model_dump() for booking in booking_dtos]))
            return bookings

    def get_by_id(self, booking_id: int):
        db_booking = self.slave_db.query(Booking).filter(
            Booking.id == booking_id).first()

        if db_booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")

        return db_booking

    def update(self, booking_id: int, updated_booking: BookingUpdateDto):
        db_booking = self.slave_db.query(Booking).filter(
            Booking.id == booking_id).first()

        if db_booking is None:
            raise HTTPException(
                status_code=404, detail="Booking to update not found")

        db_booking.user_credentials = updated_booking.user_credentials

        self.master_db.commit()
        self.master_db.refresh(db_booking)

        self.redis_cache.delete('bookings')

        return db_booking.id

    def delete(self, booking_id: int):
        db_booking = self.slave_db.query(Booking).filter(
            Booking.id == booking_id).first()

        if db_booking is None:
            raise HTTPException(
                status_code=404, detail="Booking to delete not found")

        db_train = self.slave_db.query(Train).filter(
            Train.id == db_booking.train_id).first()
        db_train.available_seats += 1

        message = f"A booking was cancelled by {
            db_booking.user_credentials}.\nAvailable seats: {db_train.available_seats}\n"
        self.rabbitmq.send_message_to_exchange(
            routing_key=str(db_train.id), message=message)

        self.master_db.delete(db_booking)
        self.master_db.commit()

        self.redis_cache.delete('bookings')

        return db_booking.id


def get_booking_manager(
    master_db: Session = Depends(lambda: next(get_db())[0]),
    slave_db: Session = Depends(lambda: next(get_db())[1]),
    rabbitmq: RabbitMQ = Depends(get_rabbitmq),
    redis_cache: redis.RedisCluster = Depends(get_redis_client)
) -> BookingManager:
    return BookingManager(master_db, slave_db, rabbitmq, redis_cache)
