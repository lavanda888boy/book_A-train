import logging
from logstash import TCPLogstashHandler
import os


def setup_logging():
    logger = logging.getLogger('train_booking_service_logger')
    logger.setLevel(logging.INFO)

    logstash_handler = TCPLogstashHandler(
        os.getenv('LOGSTASH_HOST'), os.getenv('LOGSTASH_PORT'), version=1)
    logger.addHandler(logstash_handler)

    return logger
