# Process Monitoring System

## Overview
- Agent (Python, can be compiled to EXE) collects running processes, CPU/Memory, parent-child relationships, and hostname; pushes to backend.
- Backend (Django + DRF + SQLite) stores latest process snapshot per machine and serves data via REST.
- Frontend (HTML/CSS/JS) displays machines, expandable process tree, resources summary, search/filter/sort, and auto-refresh.

## Architecture
- Models: `Machine(hostname, last_updated)`, `Process(machine, pid, name, cpu_usage, memory_usage, parent_pid, timestamp)`.
- API Key: configured in Django settings as `AGENT_API_KEY`; agent sends it via `API-Key` header.
- Data flow: Agent → POST `/api/processes/` replaces prior processes for that machine; GET `/api/processes/latest/` returns all machines with their current processes.

## API
- POST `/api/processes/`
  - Headers: `API-Key: <AGENT_API_KEY>`
  - Body:
    ```json
    {
      "hostname": "MACHINE-NAME",
      "processes": [
        {"pid": 123, "name": "proc", "cpu_usage": 12.3, "memory_usage": 1.5, "parent_pid": 1}
      ]
    }
    ```
  - Response: `{ "status": "success" }`

- GET `/api/processes/latest/`
  - Response: `[{ "hostname": "...", "last_updated": "...", "processes": [ ... ] }]`

## Running the Backend
```bash
# From repo root
source backend/myenv/bin/activate
cd backend/process_monitoring
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

## Building and Running the Agent
- Configuration: `agent/config.json`
  ```json
  {
    "backend_url": "http://127.0.0.1:8000/api/processes/",
    "api_key": "wedbhhbqwsasbbjsws",
    "interval_seconds": 10,
    "max_retries": 3,
    "retry_backoff_seconds": 2.0,
    "timeout_seconds": 10
  }
  ```
- Run once (Python):
  ```bash
  cd agent
  source ../backend/myenv/bin/activate  # or your Python env with psutil/requests
  python agent.py
  ```
- Build EXE (Windows, with PyInstaller):
  ```bash
  # Ensure PyInstaller is installed in your env
  pyinstaller --onefile --add-data config.json:. agent.py
  # EXE will be in dist/agent.exe; place config.json alongside if not embedded
  ```

## Frontend
- Open `frontend/index.html` in a browser.
- Features: Sidebar machine search, Processes/Resources tabs, process tree with expand/collapse, column headers, search/filter/sort, auto-refresh.

## Assumptions
- CPU/Memory reported per process and summed in UI for overview (may exceed 100%).
- Backend stores only the latest snapshot per machine (historic data not retained).

## Future Enhancements
- Historical data: add `Snapshot` model and persist process records per snapshot; endpoints for time-range queries.
- Real-time updates: WebSockets (Django Channels) to push updates to clients.
- Auth hardening: move `AGENT_API_KEY` to environment variables; optional HMAC signed payloads.
- Charts/visualizations: time-series CPU/RAM per machine; top processes over time.
- Pagination/virtualization for very large process lists.
- RBAC and auth for frontend if exposed beyond local network. 