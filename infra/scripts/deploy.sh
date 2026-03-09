#!/usr/bin/env bash
# deploy.sh – Backwards-compatible wrapper for blue/green deployment
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/deploy-blue-green.sh"
