import psutil
import socket
import requests
import json
import time
import os
import sys
from typing import List, Dict


def resolve_base_dir() -> str:
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS  # type: ignore[attr-defined]
    return os.path.dirname(os.path.abspath(__file__))


def load_config() -> dict:
    base_dir = resolve_base_dir()
    config_path = os.path.join(base_dir, 'config.json')
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


CONFIG = load_config()
BACKEND_URL = CONFIG.get("backend_url")
API_KEY = CONFIG.get("api_key")
INTERVAL_SECONDS = int(CONFIG.get("interval_seconds", 0))  # 0 => send once and exit
MAX_RETRIES = int(CONFIG.get("max_retries", 3))
RETRY_BACKOFF_SECONDS = float(CONFIG.get("retry_backoff_seconds", 2.0))
TIMEOUT_SECONDS = float(CONFIG.get("timeout_seconds", 10.0))


def sample_cpu_then_collect() -> List[Dict]:
    # First pass to prime cpu_percent counters
    for proc in psutil.process_iter(['pid']):
        try:
            p = psutil.Process(proc.info['pid'])
            p.cpu_percent(None)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    time.sleep(0.5)

    process_list: List[Dict] = []
    for proc in psutil.process_iter(['pid', 'name', 'memory_percent', 'ppid']):
        try:
            p = psutil.Process(proc.info['pid'])
            cpu = p.cpu_percent(None)  # value since last call
            process_list.append({
                "pid": proc.info['pid'],
                "name": proc.info.get('name') or str(proc.info['pid']),
                "cpu_usage": float(cpu),
                "memory_usage": float(proc.info.get('memory_percent') or 0.0),
                "parent_pid": int(proc.info.get('ppid') or 0) or None,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return process_list


def make_payload() -> Dict:
    return {
        "hostname": socket.gethostname(),
        "processes": sample_cpu_then_collect(),
    }


def send_with_retry(session: requests.Session, url: str, payload: Dict) -> None:
    headers = {"API-Key": API_KEY}
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            res = session.post(url, json=payload, headers=headers, timeout=TIMEOUT_SECONDS)
            print("Sent:", res.status_code, getattr(res, 'text', ''))
            if res.ok:
                return
        except Exception as e:
            print(f"Attempt {attempt} error: {e}")
        if attempt < MAX_RETRIES:
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)


def run_once() -> None:
    payload = make_payload()
    with requests.Session() as session:
        send_with_retry(session, BACKEND_URL, payload)


def run_loop(interval: int) -> None:
    next_time = time.time()
    with requests.Session() as session:
        while True:
            payload = make_payload()
            send_with_retry(session, BACKEND_URL, payload)
            next_time += interval
            sleep_for = max(0, next_time - time.time())
            time.sleep(sleep_for)


if __name__ == "__main__":
    if INTERVAL_SECONDS and INTERVAL_SECONDS > 0:
        run_loop(INTERVAL_SECONDS)
    else:
        run_once()
