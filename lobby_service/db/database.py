from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

import os

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL is None:
    DATABASE_URL = "postgresql://test:1234"

engine = create_engine(DATABASE_URL, echo=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
