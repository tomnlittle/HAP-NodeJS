const fs = require('fs');
const path = require('path');
const storage = require('node-persist');
const {uuid} = require('./util/uuid');
const {Bridge} = require('./Bridge');
const {Accessory} = require('./Accessory');
const {accessoryLoader} = require('./AccessoryLoader');

console.log('Starting...');

// Initialize our storage system
storage.initSync();

// Start by creating our Bridge which will host all loaded Accessories
const bridge = new Bridge('Node Bridge', uuid.generate('Node Bridge'));

// Listen for bridge identification event
bridge.on('identify', function(paired, callback) {
    console.log('Node Bridge identify');
    callback(); // success
});

// Load up all accessories in the /accessories folder
const dir = path.join(__dirname, 'accessories');
const accessories = accessoryLoader.loadDirectory(dir);

// Add them all to the bridge
accessories.forEach(function(accessory) {
    console.log('Added: ' + accessory.displayName + ' with PIN: ' + accessory.pincode);
    bridge.addBridgedAccessory(accessory);
});

// Publish the Bridge on the local network.
bridge.publish({
    username: 'CC:22:3D:E3:CE:F6',
    port: 51826,
    pincode: '031-45-154',
    category: Accessory.Categories.BRIDGE
});

const signals = { 'SIGINT': 2, 'SIGTERM': 15 };
Object.keys(signals).forEach(function (signal) {
    process.on(signal, function () {
        bridge.unpublish();
        setTimeout(function (){
            process.exit(128 + signals[signal]);
        }, 1000);
    });
});
