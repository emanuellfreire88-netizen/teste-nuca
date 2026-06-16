#!/bin/bash
cd /home/z/my-project
while true; do
  HOSTNAME=0.0.0.0 PORT=3000 node .next/standalone/server.js 2>&1
  echo "Server crashed, restarting in 2s..."
  sleep 2
done
