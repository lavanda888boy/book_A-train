import pika
from typing import Callable
import os

class RabbitMQ:

    rabbit_host = os.getenv('RABBITMQ_HOST')
    rabbit_user = os.getenv('RABBITMQ_USER')
    rabbit_password = os.getenv('RABBITMQ_PASS')

    def __init__(self):
        self.connection = pika.BlockingConnection(
            pika.ConnectionParameters(host=self.rabbit_host, credentials=pika.PlainCredentials(self.rabbit_user, self.rabbit_password)))
        
        self.channel = self.connection.channel()
        self.channel.exchange_declare(exchange='train_events', exchange_type='direct')

    def consume_messages(self, routing_key: str, callback: Callable[[str], None]):
        result = self.channel.queue_declare(queue='', exclusive=True)
        queue_name = result.method.queue

        self.channel.queue_bind(exchange='train_events', queue=queue_name, routing_key=routing_key)

        def on_message(ch, method, properties, body):
            callback(body.decode())

        self.channel.basic_consume(queue=queue_name, on_message_callback=on_message, auto_ack=True)
        self.channel.start_consuming()
    
    def close(self):
        self.connection.close()


def get_rabbitmq():
    rabbitmq = RabbitMQ()
    try:
        yield rabbitmq
    finally:
        rabbitmq.close() 
