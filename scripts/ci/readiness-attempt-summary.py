import json
from contextlib import suppress
from pathlib import Path

data = {}
path = Path("/tmp/backend-ready.json")
payload = path.read_text(encoding="utf-8") if path.exists() else "{}"
with suppress(Exception):
    data = json.loads(payload or "{}")

print("Reason:", data.get("reason", "unknown"))
print("FailureCategory:", data.get("failureCategory", "UNKNOWN"))
print("Phase:", data.get("phase", "unknown"))
print("FailedChecks:", json.dumps(data.get("checks", {})))
