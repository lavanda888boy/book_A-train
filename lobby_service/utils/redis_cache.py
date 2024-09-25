import redis
import os

redis_host = os.getenv("REDIS_HOST")
redis_port = os.getenv("REDIS_PORT")

def get_redis_client():
    redis_client = redis.Redis(host=redis_host, port=redis_port, db=0)
    try:
        redis_client.ping()
        print("Connected to Redis")
    except redis.ConnectionError:
        print("Could not connect to Redis")
    return redis_client
