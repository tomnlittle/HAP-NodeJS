const { Accessory } = require('../../Accessory');
const { Service } = require('../../Service');
const { Characteristic } = require('../../Characteristic');
const uuid = require('../../util/uuid');

const shell = require('shelljs');
shell.cd('src/accessories/LedStrip_accessory');

const writeLed = (command) => shell.exec(`./write.sh ${command}`);

// Initialise the light to the default settings
writeLed('On');
writeLed('White');
writeLed('Off');

const MIN_SATURATION = 50;

const config = {
    name: 'LED Strips',
    pincode: '031-45-154',
    username: 'FA:3C:ED:5A:1A:1A',
    manufacturer: 'HAP-NodeJS',
    model: 'v1.0',
    serialNumber: 'A12S345KGB'
};

let power = false;
let hue = 0;
let saturation = 0;
const logOutput = true;

const setPower = (status) => {
    if (logOutput) console.log('Turning the \'%s\' %s', config.name, status ? 'on' : 'off');

    if (status) {
        writeLed('On');
    } else {
        writeLed('Off');
    }

    power = status;
};

// const setBrightness = (percent) => {
//   if(logOutput) console.log("Setting '%s' brightness to %s", config.name, percent);

//   // about 30 button presses to reach maximum or minimum
//   const stops = 30;
//   const threshold = 100/stops;

//   brightness = percent;
// }

const setSaturation = (value) => {
    if (logOutput) console.log('Setting \'%s\' saturation to %s', config.name, value);
    saturation = value;
};


const setHue = (value) => {
    if (logOutput) console.log('Setting \'%s\' hue to %s', config.name, value);

    // there are 15 possible colours to set the lights and 360 different hue settings
    // meaning each colour gets a range of 24 in the hue spectrum

    const hues = {
        360: 'Red0',
        0 : 'Red0',
        24: 'Red1',
        48: 'Red2',
        72: 'Red3',
        96: 'Red4',
        120: 'Green0',
        144: 'Green1',
        168: 'Green2',
        192: 'Green3',
        216: 'Green4',
        240: 'Blue0',
        264: 'Blue1',
        288: 'Blue2',
        312: 'Blue3',
        336: 'Blue4'
    };

    let selectedKey = 0;
    for (const key of Object.keys(hues)) {

        // if the hue value is within 12 of this key then this is the key to set it too
        if (key < value + 12 && key > value - 12) {
            selectedKey = key;
            break;
        }
    }

    if (saturation < MIN_SATURATION) {
        writeLed('White');
    } else {
        writeLed(hues[selectedKey]);
    }

    hue = value;
};

const getPower = () => power;
const getHue = () => hue;
const getSaturation = () => saturation;

const lightUUID = uuid.generate('hap-nodejs:accessories:light' + config.name);
const lightAccessory = exports.accessory = new Accessory(config.name, lightUUID);

// Add properties for publishing (in case we're using Core.js and not BridgedCore.js)
lightAccessory.username = config.username;
lightAccessory.pincode = config.pincode;

// set some basic properties (these values are arbitrary and setting them is optional)
lightAccessory
    .getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, config.manufacturer)
    .setCharacteristic(Characteristic.Model, config.model)
    .setCharacteristic(Characteristic.SerialNumber, config.serialNumber);

lightAccessory.on('identify', (paired, callback) => callback());

lightAccessory
    .addService(Service.Lightbulb, config.name)
    .getCharacteristic(Characteristic.On)
    .on('set', function(value, callback) {
        setPower(value);
        callback();
    })
    .on('get', function(callback) {
        callback(null, getPower());
    });


lightAccessory
    .getService(Service.Lightbulb)
    .addCharacteristic(Characteristic.Saturation)
    .on('set', function(value, callback) {
        setSaturation(value);
        callback();
    })
    .on('get', function(callback) {
        callback(null, getSaturation());
    });

lightAccessory
    .getService(Service.Lightbulb)
    .addCharacteristic(Characteristic.Hue)
    .on('set', function(value, callback) {
        setHue(value);
        callback();
    })
    .on('get', function(callback) {
        callback(null, getHue());
    });
