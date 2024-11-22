import subprocess
import time
import os
import json
from redis import Redis
import requests


redis_client = Redis(
    host=os.getenv("REDIS_HOST"), port=os.getenv('REDIS_PORT'))


def get_new_master_node_info():
    try:
        result = subprocess.run(
            ["pg_autoctl", "show", "state"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        output = result.stdout

        lines = output.splitlines(keepends=True)
        new_master_info = None
        slave_info = []

        for line in lines:
            if "primary" in line.lower():
                parts = line.split('|')
                hostname_port = parts[2].strip()
                new_master_info = tuple(hostname_port.split(':'))

            if "secondary" in line.lower():
                parts = line.split('|')
                hostname_port = parts[2].strip()
                slave_info.append(tuple(hostname_port.split(':')))

        return new_master_info, slave_info

    except Exception as e:
        print(f"Error while fetching new master node info: {e}")
        return ("unknown", "unknown"), []


while True:
    master_info, slave_info = get_new_master_node_info()

    if (master_info != None) and (len(slave_info) > 0):
        master_db_connection = f"postgresql://{os.getenv('DB_USER')}:@" + \
            f"{master_info[0]}:{master_info[1]}/{os.getenv('DB_NAME')}"
        slave_dbs = [f"postgresql://{os.getenv('DB_USER')}:@"
                     f"{hostname}:{port}/{os.getenv('DB_NAME')}" for hostname, port in slave_info]

        payload = {
            "master_db": master_db_connection,
            "slave_dbs": slave_dbs
        }

        services = redis_client.lrange("train_booking_service", 0, -1)

        if services:
            for service in services:
                try:
                    response = requests.put(
                        f"http://{service.decode('utf-8')}/db", data=json.dumps(payload), headers={"Content-Type": "application/json"})
                    print(
                        f"Master and slave info was sent successfully to {service.decode('utf-8')}.")
                except requests.RequestException as e:
                    print(f"Error sending data to API: {e}")

    time.sleep(20)
