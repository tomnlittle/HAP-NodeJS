const { Accessory } = require('../../Accessory');
const { Service } = require('../../Service');
const { Characteristic } = require('../../Characteristic');
const uuid = require('../../util/uuid');
const fs = require('fs');
const shell = require('shelljs');

shell.exec('modprobe w1-gpio');
shell.exec('modprobe w1-therm');

const getTemperature = () => {

    const rootDir = '/sys/bus/w1/devices';
    const folders = fs.readdirSync(rootDir);
    const temperatureFolder = folders.filter((current) => current.indexOf('28') > -1)[0];

    const fileContents = fs.readFileSync(`${rootDir}/${temperatureFolder}/w1_slave`).toString();

    let temperature = 0;

    // check that the temperature sensor is working
    if (fileContents.indexOf('YES') > -1) {
        const tempIndex = fileContents.indexOf('t=');

        // 2 accounts for t=
        const extracted = fileContents.substring(tempIndex + 2);
        temperature = parseInt(extracted) / 1000;
    }

    return temperature;
};

const sensorUUID = uuid.generate('hap-nodejs:accessories:temperature-sensor');
const sensor = exports.accessory = new Accessory('Temperature Sensor', sensorUUID);

// Add properties for publishing (in case we're using Core.js and not BridgedCore.js)
sensor.username = 'C1:5D:3A:AE:5E:FA';
sensor.pincode = '031-45-154';

// Add the actual TemperatureSensor Service.
// We can see the complete list of Services and Characteristics in `lib/gen/HomeKitTypes.js`
sensor.addService(Service.TemperatureSensor)
    .getCharacteristic(Characteristic.CurrentTemperature)
    .on('get', function(callback) {
        callback(null, getTemperature());
    });
