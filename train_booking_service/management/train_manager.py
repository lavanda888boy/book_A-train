from fastapi import Depends, HTTPException
from db.models import Train
from db.schemas import TrainBaseDto, TrainInfoDto, TrainUpdateDto
from db.database import get_db
from sqlalchemy.orm import Session
from utils.redis_cache import get_redis_client
from utils.rabbitmq import RabbitMQ, get_rabbitmq

import redis
import json


class TrainManager:

    def __init__(self, master_db: Session, slave_db: Session, rabbitmq: RabbitMQ, redis_cache: redis.RedisCluster):
        self.master_db = master_db
        self.slave_db = slave_db
        self.rabbitmq = rabbitmq
        self.redis_cache = redis_cache

    def create(self, train: TrainBaseDto):
        db_train = Train(route=train.route, departure_time=train.departure_time,
                         arrival_time=train.arrival_time, available_seats=train.available_seats)

        self.master_db.add(db_train)
        self.master_db.commit()
        self.master_db.refresh(db_train)

        self.redis_cache.delete('trains')

        return db_train.id

    def get_all(self):
        trains = self.redis_cache.get("trains")

        if trains:
            return json.loads(trains)
        else:
            trains = self.slave_db.query(Train).all()
            train_dtos = [TrainInfoDto.model_validate(
                train) for train in trains]
            self.redis_cache.setex(name="trains", time=120, value=json.dumps(
                [train.model_dump(mode='json') for train in train_dtos]))
            return trains

    def get_by_id(self, train_id: int):
        db_train = self.slave_db.query(Train).filter(
            Train.id == train_id).first()

        if db_train is None:
            raise HTTPException(status_code=404, detail="Train not found")

        return db_train

    def update(self, train_id: int, updated_train: TrainUpdateDto):
        db_train = self.slave_db.query(Train).filter(
            Train.id == train_id).first()

        if db_train is None:
            raise HTTPException(
                status_code=404, detail="Train to update not found")

        message = "Train details were updated:\n"

        if updated_train.route is not None:
            message += f"{db_train.route} -> {updated_train.route}\n"
            db_train.route = updated_train.route
        if updated_train.departure_time is not None:
            message += f"Departure time: {db_train.departure_time} -> {
                updated_train.departure_time}\n"
            db_train.departure_time = updated_train.departure_time
        if updated_train.arrival_time is not None:
            message += f"Arrival time: {db_train.arrival_time} -> {
                updated_train.arrival_time}\n"
            db_train.arrival_time = updated_train.arrival_time
        if updated_train.available_seats is not None:
            message += f"Available seats: {db_train.available_seats} -> {
                updated_train.available_seats}\n"
            db_train.available_seats = updated_train.available_seats

        self.master_db.commit()
        self.master_db.refresh(db_train)

        self.redis_cache.delete('trains')
        self.rabbitmq.send_message_to_exchange(
            routing_key=str(train_id), message=message)

        return db_train.id

    def delete(self, train_id: int):
        db_train = self.slave_db.query(Train).filter(
            Train.id == train_id).first()

        if db_train is None:
            raise HTTPException(
                status_code=404, detail="Train to delete not found")

        self.master_db.delete(db_train)
        self.master_db.commit()

        message = "Train you were tracking was removed from the schedule. It was registered by mistake.\n"
        self.rabbitmq.send_message_to_exchange(
            routing_key=str(train_id), message=message)
        self.redis_cache.delete('trains')

        return db_train.id


def get_train_manager(
    master_db: Session = Depends(lambda: next(get_db())[0]),
    slave_db: Session = Depends(lambda: next(get_db())[1]),
    rabbitmq: RabbitMQ = Depends(get_rabbitmq),
    redis_cache: redis.RedisCluster = Depends(get_redis_client)
) -> TrainManager:
    return TrainManager(master_db, slave_db, rabbitmq, redis_cache)
