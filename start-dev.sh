#!/bin/bash
# Keep-alive dev server for Nuca Plataforma
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting Next.js dev server..."
  node node_modules/.bin/next dev -p 3000 -H 0.0.0.0
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE. Restarting in 3s..."
  sleep 3
done
