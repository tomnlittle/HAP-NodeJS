const storage = require('node-persist');
const uuid = require('./util/uuid');
const Accessory = require('./Accessory');
const Camera = require('./Camera');

console.log('HAP-NodeJS starting...');

// Initialize our storage system
storage.initSync();

// Start by creating our Bridge which will host all loaded Accessories
const cameraAccessory = new Accessory('Node Camera', uuid.generate('Node Camera'));

const cameraSource = new Camera();

cameraAccessory.configureCameraSource(cameraSource);

cameraAccessory.on('identify', function(paired, callback) {
    console.log('Node Camera identify');
    callback(); // success
});

// Publish the camera on the local network.
cameraAccessory.publish({
    username: 'EC:22:3D:D3:CE:CE',
    port: 51062,
    pincode: '031-45-154',
    category: Accessory.Categories.CAMERA
}, true);

const signals = { 'SIGINT': 2, 'SIGTERM': 15 };
Object.keys(signals).forEach(function (signal) {
    process.on(signal, function () {
        cameraAccessory.unpublish();
        setTimeout(function (){
            process.exit(128 + signals[signal]);
        }, 1000);
    });
});
