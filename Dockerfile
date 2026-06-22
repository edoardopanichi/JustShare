FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY justshare ./justshare

ENV JUSTSHARE_HOST=0.0.0.0
ENV JUSTSHARE_PORT=8787
ENV JUSTSHARE_STORAGE_DIR=/data

EXPOSE 8787
VOLUME ["/data"]

CMD ["python", "-m", "justshare"]
