#!/bin/bash

python ./grpc/register_service.py

python -m db.init_db

exec uvicorn main:app --host 0.0.0.0 --port 8000