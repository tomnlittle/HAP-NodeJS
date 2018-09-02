#!/bin/bash

rsync \
    --archive \
    --compress \
    --copy-links \
    --cvs-exclude \
    --perms \
    --recursive \
    --progress \
    * pi@192.168.1.230:~/homekit-server
