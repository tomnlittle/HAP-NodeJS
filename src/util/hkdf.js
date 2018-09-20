'use strict';

const crypto = require('crypto');
const bufferShim = require('buffer-shims');

module.exports = {
    HKDF: HKDF
};

function HKDF(hashAlg, salt, ikm, info, size) {
    // create the hash alg to see if it exists and get its length
    const hash = crypto.createHash(hashAlg);
    const hashLength = hash.digest().length;

    // now we compute the PRK
    var hmac = crypto.createHmac(hashAlg, salt);
    hmac.update(ikm);
    const prk = hmac.digest();

    let prev = bufferShim.alloc(0);
    let output;
    const buffers = [];
    const num_blocks = Math.ceil(size / hashLength);
    info = bufferShim.from(info);

    for (let i=0; i<num_blocks; i++) {
        var hmac = crypto.createHmac(hashAlg, prk);

        const input = Buffer.concat([
            prev,
            info,
            bufferShim.from(String.fromCharCode(i + 1))
        ]);
        hmac.update(input);
        prev = hmac.digest();
        buffers.push(prev);
    }
    output = Buffer.concat(buffers, size);
    return output.slice(0,size);
}
