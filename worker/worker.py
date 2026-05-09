"""
AI Task Platform — Python Worker

Consumes tasks from Redis queue, processes them, and updates status/results in MongoDB.
Includes health HTTP server for K8s probes and Dead Letter Queue for failed tasks.
"""

import os
import time
import json
import logging
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

import redis
import pymongo
from pymongo import errors as mongo_errors
from bson.objectid import ObjectId

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format='%(message)s',
)
logger = logging.getLogger("worker")

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "task_id"):
            log_entry["task_id"] = record.task_id
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)

handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger.handlers = [handler]

REDIS_URI = os.getenv("REDIS_URI", "redis://redis:6379")
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://mongo:27017/ai-task-platform")
POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "1"))
HEALTH_PORT = int(os.getenv("HEALTH_PORT", "8080"))

OPERATIONS = {
    "uppercase": lambda text: text.upper(),
    "lowercase": lambda text: text.lower(),
    "reverse": lambda text: text[::-1],
    "word_count": lambda text: str(len(text.split())),
}

DLQ_REDIS_KEY = "task:dlq"
HEALTHY = True


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if HEALTHY:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        else:
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "unhealthy"}).encode())

    def log_message(self, format, *args):
        pass


def start_health_server():
    server = HTTPServer(("0.0.0.0", HEALTH_PORT), HealthHandler)
    logger.info(f"Health server listening on port {HEALTH_PORT}")
    server.serve_forever()


def get_mongo():
    client = pymongo.MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
    db = client.get_database()
    return db, client


def push_to_dlq(redis_client, task_id: str, error: str):
    try:
        entry = json.dumps({"task_id": task_id, "error": error, "timestamp": time.time()})
        redis_client.lpush(DLQ_REDIS_KEY, entry)
        logger.info(f"Task {task_id} moved to DLQ")
    except Exception as e:
        logger.error(f"Failed to push task {task_id} to DLQ: {e}")


def process_task(task_id: str):
    db, mongo_client = get_mongo()
    try:
        tasks = db["tasks"]
        task = tasks.find_one({"_id": ObjectId(task_id)})
        if not task:
            logger.warning(f"Task {task_id} not found in DB")
            return

        op = task.get("operation")
        if op not in OPERATIONS:
            tasks.update_one(
                {"_id": task["_id"]},
                {"$set": {"status": "failed", "error": f"Unknown operation: {op}"},
                 "$push": {"logs": f"ERROR: Unknown operation {op}"}},
            )
            logger.error(f"Unknown operation '{op}' for task {task_id}")
            return

        text = task.get("inputText", "")
        task_title = task.get("title", "Untitled")

        tasks.update_one(
            {"_id": task["_id"]},
            {"$set": {"status": "running"},
             "$push": {"logs": f"Worker picked up task '{task_title}' — running {op}"}},
        )
        logger.info(f"Processing task {task_id}: {op} on '{text[:50]}...'", extra={"task_id": task_id})

        try:
            result = OPERATIONS[op](text)
        except Exception as e:
            tasks.update_one(
                {"_id": task["_id"]},
                {"$set": {"status": "failed", "error": str(e)},
                 "$push": {"logs": f"ERROR: {str(e)}"}},
            )
            logger.error(f"Task {task_id} failed during processing: {e}", extra={"task_id": task_id})
            r = redis.Redis.from_url(REDIS_URI, decode_responses=True)
            push_to_dlq(r, task_id, str(e))
            r.close()
            return

        tasks.update_one(
            {"_id": task["_id"]},
            {"$set": {"status": "success", "result": result},
             "$push": {"logs": f"Task completed successfully. Result: {result[:100]}"}},
        )
        logger.info(f"Task {task_id} completed with result '{result[:50]}...'", extra={"task_id": task_id})
    except pymongo.errors.PyMongoError as e:
        logger.error(f"MongoDB error processing task {task_id}: {e}", extra={"task_id": task_id})
    finally:
        mongo_client.close()


def main():
    global HEALTHY
    logger.info("Worker starting...")

    health_thread = threading.Thread(target=start_health_server, daemon=True)
    health_thread.start()

    r = redis.Redis.from_url(REDIS_URI, decode_responses=True)
    HEALTHY = True

    while True:
        try:
            r.ping()
            popped = r.brpop("task:queue", timeout=POLL_INTERVAL)
            if popped:
                _, task_id = popped
                logger.info(f"Received task: {task_id}", extra={"task_id": task_id})
                process_task(task_id)
            HEALTHY = True
        except redis.exceptions.ConnectionError:
            logger.warning("Redis unavailable, retrying in 5s...")
            HEALTHY = False
            time.sleep(5)
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            time.sleep(1)


if __name__ == "__main__":
    main()
