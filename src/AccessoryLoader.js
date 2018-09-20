'use strict';

const fs = require('fs');
const path = require('path');
const {Accessory} = require('./Accessory');
const {Service} = require('./Service');
const {Characteristic} = require('./Characteristic');
const uuid = require('./util/uuid');
const debug = require('debug')('AccessoryLoader');

module.exports = {
    loadDirectory: loadDirectory,
    parseAccessoryJSON: parseAccessoryJSON,
    parseServiceJSON: parseServiceJSON,
    parseCharacteristicJSON: parseCharacteristicJSON
};

/**
 * Loads all accessories from the given folder. Handles object-literal-style accessories, "accessory factories",
 * and new-API style modules.
 */

function loadDirectory(dir) {

    // exported accessory objects loaded from this dir
    let accessories = [];

    fs.readdirSync(dir).forEach(function(file) {

    // "Accessories" are modules that export a single accessory.
        if (file.split('_').pop() === 'accessory.js') {
            debug('Parsing accessory: %s', file);
            const loadedAccessory = require(path.join(dir, file)).accessory;
            accessories.push(loadedAccessory);
        }
        // "Accessory Factories" are modules that export an array of accessories.
        else if (file.split('_').pop() === 'accfactory.js') {
            debug('Parsing accessory factory: %s', file);

            // should return an array of objects { accessory: accessory-json }
            const loadedAccessories = require(path.join(dir, file));
            accessories = accessories.concat(loadedAccessories);
        }
    });

    // now we need to coerce all accessory objects into instances of Accessory (some or all of them may
    // be object-literal JSON-style accessories)
    return accessories.map(function(accessory) {
        if(accessory === null || accessory === undefined) { //check if accessory is not empty
            console.log('Invalid accessory!');
            return false;
        } else {
            return (accessory instanceof Accessory) ? accessory : parseAccessoryJSON(accessory);
        }
    }).filter(function(accessory) { return accessory ? true : false; });
}

/**
 * Accepts object-literal JSON structures from previous versions of HAP-NodeJS and parses them into
 * newer-style structures of Accessory/Service/Characteristic objects.
 */

function parseAccessoryJSON(json) {

    // parse services first so we can extract the accessory name
    const services = [];

    json.services.forEach(function(serviceJSON) {
        const service = parseServiceJSON(serviceJSON);
        services.push(service);
    });

    let displayName = json.displayName;

    services.forEach(function(service) {
        if (service.UUID === '0000003E-0000-1000-8000-0026BB765291') { // Service.AccessoryInformation.UUID
            service.characteristics.forEach(function(characteristic) {
                if (characteristic.UUID === '00000023-0000-1000-8000-0026BB765291') {// Characteristic.Name.UUID
                    displayName = characteristic.value;
                }
            });
        }
    });

    const accessory = new Accessory(displayName, uuid.generate(displayName));

    // create custom properties for "username" and "pincode" for Core.js to find later (if using Core.js)
    accessory.username = json.username;
    accessory.pincode = json.pincode;

    // clear out the default services
    accessory.services.length = 0;

    console.log(services);
    // add services
    services.forEach(function(service) {
        accessory.addService(service);
    });

    return accessory;
}

function parseServiceJSON(json) {
    const serviceUUID = json.sType;

    // build characteristics first so we can extract the Name (if present)
    const characteristics = [];

    json.characteristics.forEach(function(characteristicJSON) {
        const characteristic = parseCharacteristicJSON(characteristicJSON);
        characteristics.push(characteristic);
    });

    let displayName = null;

    // extract the "Name" characteristic to use for 'type' discrimination if necessary
    characteristics.forEach(function(characteristic) {
        if (characteristic.UUID == '00000023-0000-1000-8000-0026BB765291') // Characteristic.Name.UUID
            displayName = characteristic.value;
    });

    // Use UUID for "displayName" if necessary, as the JSON structures don't have a value for this
    const service = new Service(displayName || serviceUUID, serviceUUID, displayName);

    characteristics.forEach(function(characteristic) {
        if (characteristic.UUID != '00000023-0000-1000-8000-0026BB765291') // Characteristic.Name.UUID, already present in all Services
            service.addCharacteristic(characteristic);
    });

    return service;
}

function parseCharacteristicJSON(json) {
    const characteristicUUID = json.cType;

    const characteristic = new Characteristic(json.manfDescription || characteristicUUID, characteristicUUID);

    // copy simple properties
    characteristic.value = json.initialValue;
    characteristic.setProps({
        format: json.format, // example: "int"
        minValue: json.designedMinValue,
        maxValue: json.designedMaxValue,
        minStep: json.designedMinStep,
        unit: json.unit,
        perms: json.perms // example: ["pw","pr","ev"]
    });

    // monkey-patch this characteristic to add the legacy method `updateValue` which used to exist,
    // and that accessory modules had access to via the `onRegister` function. This was the old mechanism
    // for communicating state changes about accessories that happened "outside" HomeKit.
    characteristic.updateValue = function(value, peer) {
        characteristic.setValue(value);
    };

    // monkey-patch legacy "locals" property which used to exist.
    characteristic.locals = json.locals;

    const updateFunc = json.onUpdate; // optional function(value)
    const readFunc = json.onRead; // optional function(callback(value))
    const registerFunc = json.onRegister; // optional function

    if (updateFunc) {
        characteristic.on('set', function(value, callback) {
            updateFunc(value);
            callback();
        });
    }

    if (readFunc) {
        characteristic.on('get', function(callback) {
            readFunc(function(value) {
                callback(null, value); // old onRead callbacks don't use Error as first param
            });
        });
    }

    if (registerFunc) {
        registerFunc(characteristic);
    }

    return characteristic;
}
