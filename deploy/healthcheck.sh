#!/usr/bin/env bash
set -Eeuo pipefail
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/ready >/dev/null
