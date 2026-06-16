#!/bin/bash
cd /home/z/my-project
while true; do
  HOSTNAME=0.0.0.0 PORT=3000 node .next/standalone/server.js >> /home/z/my-project/dev.log 2>&1
  echo "Restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done
