#!/bin/bash

sleep 4

python ./grpc/register_service.py

exec uvicorn main:app --host 0.0.0.0 --port 8000