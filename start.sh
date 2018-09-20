#!/bin/bash

killall node
# npm install
cd ~/homekit-server
sudo pigpiod
npm start
