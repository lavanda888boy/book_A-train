from db.schemas import DbUpdateDto
from tinydb import TinyDB, Query
from sqlalchemy import create_engine
from db.models import Base


class DbManager():

    def __init__(self, db_connections_storage="../db_connections.json"):
        self.db_connections_storage = TinyDB(db_connections_storage)

    def update_master_slave_db_information(self, db_info: DbUpdateDto):
        Record = Query()

        existing_record = self.db_connections_storage.search(
            Record.key == 'db_connections')

        if existing_record:
            self.db_connections_storage.update({
                'master': db_info.master_db,
                'slaves': db_info.slave_dbs
            }, Record.key == 'db_connections')

        else:
            self.db_connections_storage.insert({
                'key': 'db_connections',
                'master': db_info.master_db,
                'slaves': db_info.slave_dbs
            })

            self.initialize_db(db_info.master_db)

        return {"message": "Master and slave DB information updated successfully"}

    def initialize_db(self, master_db_connection_string: str):
        engine = create_engine(master_db_connection_string, echo=True)
        Base.metadata.create_all(bind=engine)


def get_db_manager() -> DbManager:
    return DbManager()
