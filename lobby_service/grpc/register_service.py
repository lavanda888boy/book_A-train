import os
import socket
import grpc
from service_discovery_pb2 import ServiceRegisterRequest
from service_discovery_pb2_grpc import ServiceDiscoveryStub

def register_service():
    sd_host = os.getenv('SD_HOST')
    sd_port = os.getenv('SD_PORT')
    channel = grpc.insecure_channel(f"{sd_host}:{sd_port}")

    stub = ServiceDiscoveryStub(channel)

    local_ip = socket.gethostbyname(socket.gethostname())
    request = ServiceRegisterRequest(
        name=os.getenv('SERVICE_NAME'),
        address=str(local_ip),
        port=8000
    )

    response = stub.Register(request)
    if response.success:
        print(f"Success: {response.success}, Message: {response.message}")
    else:
        print(f"Fail: {response.success}, Message: {response.message}")

if __name__ == '__main__':
    register_service()