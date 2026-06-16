#!/bin/bash
cd /home/z/my-project
while true; do
  echo "$(date): Starting Next.js server..."
  node node_modules/.bin/next dev -p 3000
  EXIT_CODE=$?
  echo "$(date): Server exited with code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
