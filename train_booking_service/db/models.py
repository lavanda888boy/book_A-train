from sqlalchemy import Column, Integer, String, Time, ForeignKey, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class Train(Base):
    __tablename__ = 'trains'

    id : Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    route = Column(String(100), nullable=False, index=True)
    departure_time = Column(Time, nullable=False)
    arrival_time = Column(Time, nullable=False)
    available_seats = Column(Integer, nullable=False, index=True)

    __table_args__ = (
        CheckConstraint('available_seats >= 0', name='check_available_seats_min'),
        CheckConstraint('available_seats <= 400', name='check_available_seats_max'),
    )


class Booking(Base):
    __tablename__ = 'bookings'

    id = Column(Integer, primary_key=True, index=True)
    train_id : Mapped[int] = mapped_column(ForeignKey("trains.id")) 
    user_id = Column(Integer, index=True)
