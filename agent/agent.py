import psutil
import socket
import requests
import json
import time

with open("config.json") as f:
    config = json.load(f)

BACKEND_URL = config["backend_url"]
API_KEY = config["api_key"]

def get_process_data():
    process_list = []
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'ppid']):
        try:
            process_list.append({
                "pid": proc.info['pid'],
                "name": proc.info['name'],
                "cpu_usage": proc.info['cpu_percent'],
                "memory_usage": proc.info['memory_percent'],
                "parent_pid": proc.info['ppid']
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return process_list

def send_data():
    data = {
        "hostname": socket.gethostname(),
        "processes": get_process_data()
    }
    headers = {"API-Key": API_KEY}
    try:
        res = requests.post(BACKEND_URL, json=data, headers=headers)
        print("Sent:", res.status_code, res.text)
    except Exception as e:
        print("Error sending data:", e)

if __name__ == "__main__":
    send_data()
