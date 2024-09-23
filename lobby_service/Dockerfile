FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "python -m db.init_db && uvicorn main:app --host 0.0.0.0 --port 8000"]