#!/usr/bin/env bash
set -euo pipefail
BASE="${API_BASE:-http://localhost:8080}"
echo "Checking gateway-routed endpoints..."
curl -fsS "$BASE/api/parties" >/dev/null
curl -fsS "$BASE/api/invoices" >/dev/null
curl -fsS "$BASE/api/dashboard/summary" >/dev/null
curl -fsS "$BASE/api/risk" >/dev/null
curl -fsS "$BASE/api/financing" >/dev/null
curl -fsS "$BASE/api/payments" >/dev/null
curl -fsS "$BASE/api/reconciliations" >/dev/null
if curl -fsS "$BASE/api/spark/analytics/summary" >/dev/null 2>&1; then echo "Scala/Spark analytics API responded."; else echo "Spark analytics API not ready (core smoke tests still passed)."; fi
echo "Core HTTP endpoints responded. For full business-flow verification, run scripts/seed-demo.sh and inspect dashboard counts."
