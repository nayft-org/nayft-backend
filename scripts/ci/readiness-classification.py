import json
from contextlib import suppress
from pathlib import Path

data = {}
path = Path("/tmp/backend-ready.json")
payload = path.read_text(encoding="utf-8") if path.exists() else "{}"
with suppress(Exception):
    data = json.loads(payload or "{}")

checks = data.get("checks") or {}
failed = [f"{key}=false" for key, value in checks.items() if value is False]
latest_phase = data.get("phase") or "unknown"
boot = data.get("boot") if isinstance(data.get("boot"), dict) else {}
phases = boot.get("phases") if isinstance(boot.get("phases"), list) else []
ok_phases = [
    item.get("phase")
    for item in phases
    if isinstance(item, dict) and item.get("status") == "ok" and item.get("phase")
]
last_success = ok_phases[-1] if ok_phases else "unknown"
boot_failure = data.get("bootFailure") or (
    boot.get("bootFailure") if isinstance(boot.get("bootFailure"), dict) else None
)

print("==============================")
print("READINESS FAILURE CLASSIFICATION")
print("==============================")
print("READINESS FAILURE CATEGORY:")
print(data.get("failureCategory") or "UNKNOWN")
print("")
print("FAILED CHECKS:")
print("\n".join(failed) if failed else "none")
print("")
print("STARTUP PHASE:")
print(latest_phase)
print("")
print("LAST SUCCESSFUL PHASE:")
print(last_success)
print("")
print("REASON:")
print(data.get("reason") or "unknown")
print("")
print("BOOT FAILURE:")
print(f"Phase: {boot_failure.get('phase', 'unknown') if isinstance(boot_failure, dict) else 'unknown'}")
print(
    f"Component: {boot_failure.get('component', 'unknown') if isinstance(boot_failure, dict) else 'unknown'}"
)
print(f"Reason: {boot_failure.get('reason', 'unknown') if isinstance(boot_failure, dict) else 'unknown'}")
print(
    f"Timestamp: {boot_failure.get('timestamp', 'unknown') if isinstance(boot_failure, dict) else 'unknown'}"
)
