from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from tinydb import TinyDB, Query
import random

Base = declarative_base()


def get_db():
    db_connections_storage = TinyDB("../db_connections.json")
    Record = Query()

    db_connections = db_connections_storage.search(
        Record.key == 'db_connections')

    master_db = get_connection(db_connections[0]['master'])
    slave_db = get_connection(random.choice(db_connections[0]['slaves']))

    try:
        yield (master_db, slave_db)
    finally:
        master_db.close()
        slave_db.close()


def get_connection(connection_string: str):
    engine = create_engine(connection_string, echo=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    return db
