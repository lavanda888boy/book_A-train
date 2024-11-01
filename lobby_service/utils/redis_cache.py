from redis import RedisCluster, ConnectionError
import os


def get_redis_client():
    redis_client = RedisCluster(
        host=os.getenv("REDIS_HOST"), port=os.getenv('REDIS_PORT'))

    try:
        redis_client.ping()
        print("Connected to Redis Cluster")
    except ConnectionError:
        print("Could not connect to Redis Cluster")

    return redis_client
