#!/bin/bash
cd /home/z/my-project
while true; do
  HOSTNAME=0.0.0.0 PORT=3000 node .next/standalone/server.js 2>&1 | tee -a /home/z/my-project/dev.log
  echo "Server crashed at $(date), restarting in 3s..." >> /home/z/my-project/dev.log
  sleep 3
done
