#!/bin/bash

killall node
# npm install
cd /home/pi/homekit-server
sudo pigpiod
npm start
