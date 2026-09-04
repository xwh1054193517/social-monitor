FROM python:3.12-slim

WORKDIR /app

COPY apps/telegram-worker/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/telegram-worker/worker.py ./

RUN useradd --create-home worker
USER worker

EXPOSE 9400

CMD ["python", "worker.py"]
