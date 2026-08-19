FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y python3.11 python3-pip python3.11-venv && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY vendor/fashn-vton-1.5 /app/vendor/fashn-vton-1.5
COPY services/vto /app/services/vto

RUN pip3 install --break-system-packages -e /app/vendor/fashn-vton-1.5 && \
    pip3 install --break-system-packages -r /app/services/vto/requirements.txt

ENV WEIGHTS_DIR=/app/weights
ENV RESULTS_DIR=/app/results

EXPOSE 8000

CMD ["python3", "-m", "uvicorn", "services.vto.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
