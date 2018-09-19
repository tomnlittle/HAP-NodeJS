#!/usr/bin/python
import RPi.GPIO as GPIO
import time

PIN = 31
GPIO.setwarnings(False)
GPIO.setmode(GPIO.BOARD)
GPIO.setup(PIN, GPIO.OUT)

print("something should be happening")
print(PIN)

while True:
    GPIO.output(PIN, True)
    time.sleep(1)
    GPIO.output(PIN, False)
    time.sleep(1)
