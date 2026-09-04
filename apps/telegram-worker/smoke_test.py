"""Smoke test for the GramJS -> Python sidecar migration (read-only checks)."""

import json
import urllib.error
import urllib.request

ENV = {}
for line in open(r"E:/myProject/bot/.env", encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith(("#", "//")) and "=" in line:
        k, _, v = line.partition("=")
        ENV[k] = v

BASE = "http://localhost:3001"
WORKER = "http://localhost:9400"
SECRET = ENV.get("INTERNAL_API_SECRET", "")


def call(method, url, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return None, {"error": str(e)}


def show(name, status, body):
    print(f"[{name}] status={status} body={json.dumps(body, ensure_ascii=False)[:300]}")


# 1. worker health
show("worker/health", *call("GET", f"{WORKER}/health"))

# 2. api health
s, b = call("GET", f"{BASE}/health")
print(f"[api/health] status={s} checks={json.dumps(b.get('checks', {}), ensure_ascii=False)}")

# 3. admin login
s, b = call(
    "POST",
    f"{BASE}/api/auth/login",
    {"username": ENV["ADMIN_USERNAME"], "password": ENV["ADMIN_PASSWORD"]},
)
token = (b.get("data") or {}).get("accessToken") or (b.get("data") or {}).get("token")
print(f"[auth/login] status={s} token_present={bool(token)}")
auth = {"Authorization": f"Bearer {token}"} if token else {}

# 4. telegram status via proxy -> sidecar
show("telegram/status", *call("GET", f"{BASE}/api/telegram/status", headers=auth))

# 5. dialogs without session -> expect 409
show("telegram/dialogs(no-session)", *call("GET", f"{BASE}/api/telegram/dialogs", headers=auth))

# 6. ingest auth: no secret -> 401
show("ingest(no-secret)", *call("POST", f"{BASE}/api/internal/telegram/ingest",
                                {"chatId": "123", "messageId": 1, "content": "x", "date": 1700000000}))

# 7. ingest wrong secret -> 401
show("ingest(bad-secret)", *call("POST", f"{BASE}/api/internal/telegram/ingest",
                                 {"chatId": "123", "messageId": 1, "content": "x", "date": 1700000000},
                                 {"X-Internal-Secret": "wrong"}))

# 8. ingest correct secret + unmonitored chat -> target_not_monitored (no DB write)
show("ingest(unmonitored)", *call("POST", f"{BASE}/api/internal/telegram/ingest",
                                  {"chatId": "-1000000000", "messageId": 1, "content": "x", "date": 1700000000},
                                  {"X-Internal-Secret": SECRET}))

# 9. worker /connect with a bogus session -> 400 TELEGRAM_SESSION_INVALID
show("worker/connect(bogus)", *call("POST", f"{WORKER}/connect",
                                    {"phone": "+8613800000000", "session": "bogus-session"},
                                    {"X-Internal-Secret": SECRET}))
