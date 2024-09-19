from pymongo import MongoClient
from pymongo.database import Database

MONGO_URL = "mongodb://lobby_user:lobby_password@localhost:9876"
client = MongoClient(MONGO_URL)

database = client.LobbyServiceDb

def check_db_connection():
    try:
        client.admin.command("ping")
        print("MongoDB connected successfully")
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")


def create_default_collection(collection_name):
    if collection_name not in database.list_collection_names():
        try:
            database.create_collection(collection_name)
            print(f"Collection '{collection_name}' created successfully.")
        except Exception as e:
            print(f"Failed to create collection '{collection_name}': {e}")
    else:
        print(f"Collection '{collection_name}' already exists.")


def get_database() -> Database:
    return database


if __name__ == "__main__":
    check_db_connection()
    create_default_collection("lobbies")
