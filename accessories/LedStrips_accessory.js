var Accessory = require('../').Accessory;
var Service = require('../').Service;
var Characteristic = require('../').Characteristic;
var uuid = require('../').uuid;

var shell = require('shelljs');
shell.cd('accessories')

const writeLed = (command) => {
  shell.exec(`./write.sh ${command}`);
}

// Initialise the light to the default settings
writeLed('On')
writeLed('White')
writeLed('Off')

const MIN_SATURATION = 50;

var LightController = {
  name: "LED Strips",
  pincode: "031-45-154",
  username: "FA:3C:ED:5A:1A:1A",
  manufacturer: "HAP-NodeJS",
  model: "v1.0",
  serialNumber: "A12S345KGB",
  power: false,
  brightness: 100,
  hue: 0,
  saturation: 0,
  outputLogs: true,

  setPower: function(status) {
    if(this.outputLogs) console.log("Turning the '%s' %s", this.name, status ? "on" : "off");

    const iterations = 35;
    const waitLength = 100;

    if (status) {

      writeLed('On');

      // for (let i = 0; i < iterations; i++) {
      //   setTimeout(() => {
      //     writeLed('BrightUp');
      //   }, i * waitLength)
      // }

    } else {

      // for (let i = 0; i < iterations; i++) {
      //   setTimeout(() => {
      //     writeLed('BrightDown');
      //   }, i * waitLength)
      // }

      // setTimeout(() => {
        writeLed('Off');
      // }, iterations * waitLength)

    }

    this.power = status;
  },

  getPower: function() {
    if(this.outputLogs) console.log("'%s' is %s.", this.name, this.power ? "on" : "off");
    return this.power;
  },

  setBrightness: function(brightness) {
    if(this.outputLogs) console.log("Setting '%s' brightness to %s", this.name, brightness);
    this.brightness = brightness;
  },

  getBrightness: function() {
    if(this.outputLogs) console.log("'%s' brightness is %s", this.name, this.brightness);
    // about 30 stops
    return this.brightness;
  },

  setSaturation: function(saturation) {
    if(this.outputLogs) console.log("Setting '%s' saturation to %s", this.name, saturation)
    this.saturation = saturation;
  },

  getSaturation: function() {
    if(this.outputLogs) console.log("'%s' saturation is %s", this.name, this.saturation);
    return this.saturation;
  },

  setHue: function(hue) {
    if(this.outputLogs) console.log("Setting '%s' hue to %s", this.name, hue);

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
    }

    let selectedKey = 0;
    for (const key of Object.keys(hues)){

      // if the hue value is within 12 of this key then this is the key to set it too
      if (key < hue + 12 && key > hue - 12) {
        selectedKey = key;
        break;
      }
    }

    if (this.saturation < MIN_SATURATION) {
      writeLed('White')
    } else {
      writeLed(hues[selectedKey]);
    }

    this.hue = hue;
  },

  getHue: function() {
    if(this.outputLogs) console.log("'%s' hue is %s", this.name, this.hue);
    return this.hue;
  },

  identify: function() {
    if(this.outputLogs) console.log("Identify the '%s'", this.name);
  }
}

// Generate a consistent UUID for our light Accessory that will remain the same even when
// restarting our server. We use the `uuid.generate` helper function to create a deterministic
// UUID based on an arbitrary "namespace" and the word "light".
var lightUUID = uuid.generate('hap-nodejs:accessories:light' + LightController.name);

// This is the Accessory that we'll return to HAP-NodeJS that represents our light.
var lightAccessory = exports.accessory = new Accessory(LightController.name, lightUUID);

// Add properties for publishing (in case we're using Core.js and not BridgedCore.js)
lightAccessory.username = LightController.username;
lightAccessory.pincode = LightController.pincode;

// set some basic properties (these values are arbitrary and setting them is optional)
lightAccessory
  .getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, LightController.manufacturer)
    .setCharacteristic(Characteristic.Model, LightController.model)
    .setCharacteristic(Characteristic.SerialNumber, LightController.serialNumber);

// listen for the "identify" event for this Accessory
lightAccessory.on('identify', function(paired, callback) {
  LightController.identify();
  callback();
});

// Add the actual Lightbulb Service and listen for change events from iOS.
// We can see the complete list of Services and Characteristics in `lib/gen/HomeKitTypes.js`
lightAccessory
  .addService(Service.Lightbulb, LightController.name) // services exposed to the user should have "names" like "Light" for this case
  .getCharacteristic(Characteristic.On)
  .on('set', function(value, callback) {
    LightController.setPower(value);

    // Our light is synchronous - this value has been successfully set
    // Invoke the callback when you finished processing the request
    // If it's going to take more than 1s to finish the request, try to invoke the callback
    // after getting the request instead of after finishing it. This avoids blocking other
    // requests from HomeKit.
    callback();
  })
  // We want to intercept requests for our current power state so we can query the hardware itself instead of
  // allowing HAP-NodeJS to return the cached Characteristic.value.
  .on('get', function(callback) {
    callback(null, LightController.getPower());
  });

// To inform HomeKit about changes occurred outside of HomeKit (like user physically turn on the light)
// Please use Characteristic.updateValue
//
// lightAccessory
//   .getService(Service.Lightbulb)
//   .getCharacteristic(Characteristic.On)
//   .updateValue(true);

// also add an "optional" Characteristic for Brightness
lightAccessory
  .getService(Service.Lightbulb)
  .addCharacteristic(Characteristic.Brightness)
  .on('set', function(value, callback) {
    LightController.setBrightness(value);
    callback();
  })
  .on('get', function(callback) {
    callback(null, LightController.getBrightness());
  });

// also add an "optional" Characteristic for Saturation
lightAccessory
  .getService(Service.Lightbulb)
  .addCharacteristic(Characteristic.Saturation)
  .on('set', function(value, callback) {
    LightController.setSaturation(value);
    callback();
  })
  .on('get', function(callback) {
    callback(null, LightController.getSaturation());
  });

// also add an "optional" Characteristic for Hue
lightAccessory
  .getService(Service.Lightbulb)
  .addCharacteristic(Characteristic.Hue)
  .on('set', function(value, callback) {
    LightController.setHue(value);
    callback();
  })
  .on('get', function(callback) {
    callback(null, LightController.getHue());
  });
