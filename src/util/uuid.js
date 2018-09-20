'use strict';

const crypto = require('crypto');

module.exports = {
    generate: generate,
    isValid: isValid,
    unparse: unparse
};

// http://stackoverflow.com/a/25951500/66673
function generate(data) {
    const sha1sum = crypto.createHash('sha1');
    sha1sum.update(data);
    const s = sha1sum.digest('hex');
    let i = -1;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        i += 1;
        switch (c) {
        case 'x':
            return s[i];
        case 'y':
            return ((parseInt('0x' + s[i], 16) & 0x3) | 0x8).toString(16);
        }
    });
}

const validUUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValid(UUID) {
    return validUUIDRegex.test(UUID);
}

const _byteToHex = [];
// https://github.com/defunctzombie/node-uuid/blob/master/uuid.js
function unparse(buf, offset) {
    let i = offset || 0;
    return buf[i++].toString(16) + buf[i++].toString(16) +
         buf[i++].toString(16) + buf[i++].toString(16) + '-' +
         buf[i++].toString(16) + buf[i++].toString(16) + '-' +
         buf[i++].toString(16) + buf[i++].toString(16) + '-' +
         buf[i++].toString(16) + buf[i++].toString(16) + '-' +
         buf[i++].toString(16) + buf[i++].toString(16) +
         buf[i++].toString(16) + buf[i++].toString(16) +
         buf[i++].toString(16) + buf[i++].toString(16);
}
