#!/bin/bash

rsync \
    --archive \
    --compress \
    --copy-links \
    --cvs-exclude \
    --perms \
    --recursive \
    --progress \
    --delete \
    * pi@192.168.1.230:~/homekit-server

ssh pi@192.168.1.230 "~/homekit-server/restart.sh"
