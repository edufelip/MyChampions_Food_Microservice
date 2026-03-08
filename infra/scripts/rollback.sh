#!/usr/bin/env bash
# rollback.sh – Roll back the Food Microservice to the previous Docker image,
#               or switch the mobile app back to the Firebase endpoint.
#
# Usage (from local machine):
#   ssh digiocean "cd /opt/food-microservice && bash infra/scripts/rollback.sh"
set -euo pipefail

APP_DIR="/opt/food-microservice"
SERVICE_NAME="food-microservice"

echo "=== MyChampions Food Microservice – Rollback ==="

cd "$APP_DIR"

# ─── Option A: Roll back Docker image tag ─────────────────────────────────────
# If you tagged the previous image before deploying, you can restore it:
#
#   PREV_IMAGE="mychampions-food-microservice:prev"
#   docker compose down
#   docker tag "$PREV_IMAGE" mychampions-food-microservice:latest
#   docker compose up -d
#
# Uncomment and adjust if image tagging is in place.
# ─────────────────────────────────────────────────────────────────────────────

# ─── Option B: Stop the container (re-enables Firebase path if Nginx is updated) ─
echo "--- Stopping and removing container..."
docker compose down

# ─── Option C: Redirect Nginx to Firebase Cloud Function URL ──────────────────
# If you need to fully revert to Firebase, update the mobile app's
# EXPO_PUBLIC_FOOD_SEARCH_FUNCTION_URL to the original Firebase URL and
# rebuild/redeploy the app. No server-side change is needed for the Firebase
# endpoint itself since it is publicly accessible.
#
# To quickly disable the VPS Nginx site without removing it:
#   sudo rm -f /etc/nginx/sites-enabled/food-microservice
#   sudo systemctl reload nginx

echo ""
echo "=== Rollback complete ==="
echo "The Docker container has been stopped."
echo ""
echo "NEXT STEPS to restore Firebase endpoint:"
echo "  1. In the mobile app, set EXPO_PUBLIC_FOOD_SEARCH_FUNCTION_URL back to"
echo "     the original Firebase Cloud Function URL."
echo "  2. Rebuild and redeploy the mobile app (Expo EAS build)."
echo "  OR"
echo "  1. sudo rm -f /etc/nginx/sites-enabled/food-microservice"
echo "  2. sudo systemctl reload nginx"
echo "  3. Update DNS/mobile app URL back to Firebase."
