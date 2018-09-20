const Accessory = require('./lib/Accessory.js').Accessory;
const Bridge = require('./lib/Bridge.js').Bridge;
const Camera = require('./lib/Camera.js').Camera;
const Service = require('./lib/Service.js').Service;
const Characteristic = require('./lib/Characteristic.js').Characteristic;
const uuid = require('./lib/util/uuid');
const AccessoryLoader = require('./lib/AccessoryLoader.js');
const StreamController = require('./lib/StreamController.js').StreamController;
const storage = require('node-persist');
const HAPServer = require('./lib/HAPServer').HAPServer;

// ensure Characteristic subclasses are defined
const HomeKitTypes = require('./lib/gen/HomeKitTypes');

module.exports = {
    init: init,
    Accessory: Accessory,
    Bridge: Bridge,
    Camera: Camera,
    Service: Service,
    Characteristic: Characteristic,
    uuid: uuid,
    AccessoryLoader: AccessoryLoader,
    StreamController: StreamController,
    HAPServer: HAPServer
};

function init(storagePath) {
    // initialize our underlying storage system, passing on the directory if needed
    if (typeof storagePath !== 'undefined')
        storage.initSync({ dir: storagePath });
    else
        storage.initSync(); // use whatever is default
}
