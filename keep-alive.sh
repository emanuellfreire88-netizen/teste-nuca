#!/bin/bash
cd /home/z/my-project
while true; do
  HOSTNAME=0.0.0.0 PORT=3000 bun .next/standalone/server.js 2>&1
  echo "[$(date)] Server exited, restarting in 2s..." >> /home/z/my-project/crash.log
  sleep 2
done
