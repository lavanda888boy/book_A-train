import pika
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

    def send_message_to_exchange(self, routing_key: str, message: str):
        self.channel.basic_publish(
            exchange='train_events',
            routing_key=routing_key,
            body=message
        )
        
    def close(self):
        self.connection.close()


def get_rabbitmq():
    rabbitmq = RabbitMQ()
    try:
        yield rabbitmq
    finally:
        rabbitmq.close() 
