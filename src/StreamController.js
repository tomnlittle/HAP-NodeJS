

const debug = require('debug')('StreamController');
// const inherits = require('util').inherits;
// const EventEmitter = require('events').EventEmitter;
// const clone = require('./util/clone').clone;
// const uuid = require('./util/uuid');
const tlv = require('./util/tlv');
const {Service} = require('./Service');
const {Characteristic} = require('./Characteristic');
// const HomeKitTypes = require('./gen/HomeKitTypes');

const RTPProxy = require('./camera/RTPProxy');
const crypto = require('crypto');
const ip = require('ip');
const bufferShim = require('buffer-shims');

module.exports = {
    StreamController: StreamController
};

function StreamController(identifier, options, cameraSource) {
    if (identifier === undefined) {
        throw new Error('Identifier cannot be undefined');
    }

    if (!options) {
        throw new Error('Options cannot be undefined');
    }

    if (!cameraSource) {
        throw new Error('CameraSource cannot be undefined');
    }

    const self = this;
    self.identifier = identifier;
    self.cameraSource = cameraSource;

    self.requireProxy = options['proxy'] || false;
    self.disableAudioProxy = options['disable_audio_proxy'] || false;

    self.supportSRTP = options['srtp'] || false;

    self.supportedRTPConfiguration = self._supportedRTPConfiguration(self.supportSRTP);

    const videoParams = options['video'];
    if (!videoParams) {
        throw new Error('Video parameters cannot be undefined in options');
    }

    self.supportedVideoStreamConfiguration = self._supportedVideoStreamConfiguration(videoParams);

    const audioParams = options['audio'];
    if (!audioParams) {
        throw new Error('Audio parameters cannot be undefined in options');
    }

    self.supportedAudioStreamConfiguration = self._supportedAudioStreamConfiguration(audioParams);

    self.selectedConfiguration = null;
    self.sessionIdentifier = null;
    self.streamStatus = StreamController.StreamingStatus.AVAILABLE;
    self.videoOnly = false;

    self._createService();
}

StreamController.prototype.forceStop = function() {
    this.connectionID = undefined;
    this._handleStopStream(undefined, true);
};

StreamController.prototype.handleCloseConnection = function(connectionID) {
    if (this.connectionID && this.connectionID == connectionID) {
        this.connectionID = undefined;
        this._handleStopStream();
    }
};

StreamController.SetupTypes = {
    SESSION_ID: 0x01,
    STATUS: 0x02,
    ADDRESS: 0x03,
    VIDEO_SRTP_PARAM: 0x04,
    AUDIO_SRTP_PARAM: 0x05,
    VIDEO_SSRC: 0x06,
    AUDIO_SSRC: 0x07
};

StreamController.SetupStatus = {
    SUCCESS: 0x00,
    BUSY: 0x01,
    ERROR: 0x02
};

StreamController.SetupAddressVer = {
    IPV4: 0x00,
    IPV6: 0x01
};

StreamController.SetupAddressInfo = {
    ADDRESS_VER: 0x01,
    ADDRESS: 0x02,
    VIDEO_RTP_PORT: 0x03,
    AUDIO_RTP_PORT: 0x04
};

StreamController.SetupSRTP_PARAM = {
    CRYPTO: 0x01,
    MASTER_KEY: 0x02,
    MASTER_SALT: 0x03
};

StreamController.StreamingStatus = {
    AVAILABLE: 0x00,
    STREAMING: 0x01,
    BUSY: 0x02
};

StreamController.RTPConfigTypes = {
    CRYPTO: 0x02
};

StreamController.SRTPCryptoSuites = {
    AES_CM_128_HMAC_SHA1_80: 0x00,
    AES_CM_256_HMAC_SHA1_80: 0x01,
    NONE: 0x02
};

StreamController.VideoTypes = {
    CODEC: 0x01,
    CODEC_PARAM: 0x02,
    ATTRIBUTES: 0x03,
    RTP_PARAM: 0x04
};

StreamController.VideoCodecTypes = {
    H264: 0x00
};

StreamController.VideoCodecParamTypes = {
    PROFILE_ID: 0x01,
    LEVEL: 0x02,
    PACKETIZATION_MODE: 0x03,
    CVO_ENABLED: 0x04,
    CVO_ID: 0x05
};

StreamController.VideoCodecParamCVOTypes = {
    UNSUPPORTED: 0x01,
    SUPPORTED: 0x02
};

StreamController.VideoCodecParamProfileIDTypes = {
    BASELINE: 0x00,
    MAIN: 0x01,
    HIGH: 0x02
};

StreamController.VideoCodecParamLevelTypes = {
    TYPE3_1: 0x00,
    TYPE3_2: 0x01,
    TYPE4_0: 0x02
};

StreamController.VideoCodecParamPacketizationModeTypes = {
    NON_INTERLEAVED: 0x00
};

StreamController.VideoAttributesTypes = {
    IMAGE_WIDTH: 0x01,
    IMAGE_HEIGHT: 0x02,
    FRAME_RATE: 0x03
};

StreamController.SelectedStreamConfigurationTypes = {
    SESSION: 0x01,
    VIDEO: 0x02,
    AUDIO: 0x03
};

StreamController.RTPParamTypes = {
    PAYLOAD_TYPE: 0x01,
    SYNCHRONIZATION_SOURCE: 0x02,
    MAX_BIT_RATE: 0x03,
    RTCP_SEND_INTERVAL: 0x04,
    MAX_MTU: 0x05,
    COMFORT_NOISE_PAYLOAD_TYPE: 0x06
};

StreamController.AudioTypes = {
    CODEC: 0x01,
    CODEC_PARAM: 0x02,
    RTP_PARAM: 0x03,
    COMFORT_NOISE: 0x04
};

StreamController.AudioCodecTypes = {
    PCMU: 0x00,
    PCMA: 0x01,
    AACELD: 0x02,
    OPUS: 0x03
};

StreamController.AudioCodecParamTypes = {
    CHANNEL: 0x01,
    BIT_RATE: 0x02,
    SAMPLE_RATE: 0x03,
    PACKET_TIME: 0x04
};

StreamController.AudioCodecParamBitRateTypes = {
    VARIABLE: 0x00,
    CONSTANT: 0x01
};

StreamController.AudioCodecParamSampleRateTypes = {
    KHZ_8: 0x00,
    KHZ_16: 0x01,
    KHZ_24: 0x02
};

// Private

StreamController.prototype._createService = function() {
    const self = this;
    const managementService = new Service.CameraRTPStreamManagement(undefined, this.identifier.toString());

    managementService
        .getCharacteristic(Characteristic.StreamingStatus)
        .on('get', function(callback) {
            const data = tlv.encode( 0x01, self.streamStatus );
            callback(null, data.toString('base64'));
        });

    managementService
        .getCharacteristic(Characteristic.SupportedRTPConfiguration)
        .on('get', function(callback) {
            callback(null, self.supportedRTPConfiguration);
        });

    managementService
        .getCharacteristic(Characteristic.SupportedVideoStreamConfiguration)
        .on('get', function(callback) {
            callback(null, self.supportedVideoStreamConfiguration);
        });

    managementService
        .getCharacteristic(Characteristic.SupportedAudioStreamConfiguration)
        .on('get', function(callback) {
            callback(null, self.supportedAudioStreamConfiguration);
        });

    managementService
        .getCharacteristic(Characteristic.SelectedStreamConfiguration)
        .on('get', function(callback) {
            debug('Read SelectedStreamConfiguration');
            callback(null, self.selectedConfiguration);
        })
        .on('set',function(value, callback, context, connectionID) {
            debug('Write SelectedStreamConfiguration');
            self._handleSelectedStreamConfigurationWrite(value, callback, connectionID);
        });

    managementService
        .getCharacteristic(Characteristic.SetupEndpoints)
        .on('get', function(callback) {
            self._handleSetupRead(callback);
        })
        .on('set', function(value, callback) {
            self._handleSetupWrite(value, callback);
        });

    self.service = managementService;
};

StreamController.prototype._handleSelectedStreamConfigurationWrite = function(value, callback, connectionID) {
    const self = this;
    self.selectedConfiguration = value;

    const data = bufferShim.from(value, 'base64');
    const objects = tlv.decode(data);

    let session;

    if(objects[StreamController.SelectedStreamConfigurationTypes.SESSION]) {
        session = tlv.decode(objects[StreamController.SelectedStreamConfigurationTypes.SESSION]);
        self.sessionIdentifier = session[0x01];

        const requestType = session[0x02][0];
        if (requestType == 1) {
            if (self.connectionID && self.connectionID != connectionID) {
                debug('Received start stream request from a different connection.');
            } else {
                self.connectionID = connectionID;
            }

            self._handleStartStream(objects, session, false, callback);
        } else if (requestType == 0) {
            if (self.connectionID && self.connectionID != connectionID) {
                debug('Received stop stream request from a different connection.');
            } else {
                self.connectionID = undefined;
            }

            self._handleStopStream(callback);
        } else if (requestType == 4) {
            self._handleStartStream(objects, session, true, callback);
        } else {
            debug('Unhandled request type: ', requestType);
            callback();
        }
    } else {
        debug('Unexpected request for Selected Stream Configuration');
        callback();
    }
};

StreamController.prototype._handleStartStream = function(objects, session, reconfigure, callback) {
    const self = this;

    const request = {
        'sessionID': self.sessionIdentifier,
        'type': !reconfigure ? 'start' : 'reconfigure'
    };

    let videoPT = null;
    let audioPT = null;

    if(objects[StreamController.SelectedStreamConfigurationTypes.VIDEO]) {
        const videoInfo = {};

        const video = tlv.decode(objects[StreamController.SelectedStreamConfigurationTypes.VIDEO]);
        var codec = video[StreamController.VideoTypes.CODEC];

        if (video[StreamController.VideoTypes.CODEC_PARAM]) {
            const videoCodecParamsTLV = tlv.decode(video[StreamController.VideoTypes.CODEC_PARAM]);
            videoInfo['profile'] = videoCodecParamsTLV[StreamController.VideoCodecParamTypes.PROFILE_ID].readUInt8(0);
            videoInfo['level'] = videoCodecParamsTLV[StreamController.VideoCodecParamTypes.LEVEL].readUInt8(0);
        }

        if (video[StreamController.VideoTypes.ATTRIBUTES]) {
            const videoAttrTLV = tlv.decode(video[StreamController.VideoTypes.ATTRIBUTES]);

            videoInfo['width'] = videoAttrTLV[StreamController.VideoAttributesTypes.IMAGE_WIDTH].readUInt16LE(0);
            videoInfo['height'] = videoAttrTLV[StreamController.VideoAttributesTypes.IMAGE_HEIGHT].readUInt16LE(0);
            videoInfo['fps'] = videoAttrTLV[StreamController.VideoAttributesTypes.FRAME_RATE].readUInt8(0);
        }

        if (video[StreamController.VideoTypes.RTP_PARAM]) {
            const videoRTPParamsTLV = tlv.decode(video[StreamController.VideoTypes.RTP_PARAM]);

            if (videoRTPParamsTLV[StreamController.RTPParamTypes.SYNCHRONIZATION_SOURCE]) {
                videoInfo['ssrc'] = videoRTPParamsTLV[StreamController.RTPParamTypes.SYNCHRONIZATION_SOURCE].readUInt32LE(0);
            }

            if (videoRTPParamsTLV[StreamController.RTPParamTypes.PAYLOAD_TYPE]) {
                videoPT = videoRTPParamsTLV[StreamController.RTPParamTypes.PAYLOAD_TYPE].readUInt8(0);
                videoInfo['pt'] = videoPT;
            }

            if (videoRTPParamsTLV[StreamController.RTPParamTypes.MAX_BIT_RATE]) {
                videoInfo['max_bit_rate'] = videoRTPParamsTLV[StreamController.RTPParamTypes.MAX_BIT_RATE].readUInt16LE(0);
            }

            if (videoRTPParamsTLV[StreamController.RTPParamTypes.RTCP_SEND_INTERVAL]) {
                videoInfo['rtcp_interval'] = videoRTPParamsTLV[StreamController.RTPParamTypes.RTCP_SEND_INTERVAL].readUInt32LE(0);
            }

            if (videoRTPParamsTLV[StreamController.RTPParamTypes.MAX_MTU]) {
                videoInfo['mtu'] = videoRTPParamsTLV[StreamController.RTPParamTypes.MAX_MTU].readUInt16LE(0);
            }
        }

        request['video'] = videoInfo;
    }

    if(objects[StreamController.SelectedStreamConfigurationTypes.AUDIO]) {
        const audioInfo = {};

        const audio = tlv.decode(objects[StreamController.SelectedStreamConfigurationTypes.AUDIO]);

        var codec = audio[StreamController.AudioTypes.CODEC];
        const audioCodecParamsTLV = tlv.decode(audio[StreamController.AudioTypes.CODEC_PARAM]);
        const audioRTPParamsTLV = tlv.decode(audio[StreamController.AudioTypes.RTP_PARAM]);
        const comfortNoise = tlv.decode(audio[StreamController.AudioTypes.COMFORT_NOISE]);

        const audioCodec = codec.readUInt8(0);
        if (audioCodec !== undefined) {
            if (audioCodec == StreamController.AudioCodecTypes.OPUS) {
                audioInfo['codec'] = 'OPUS';
            } else if (audioCodec == StreamController.AudioCodecTypes.AACELD) {
                audioInfo['codec'] = 'AAC-eld';
            } else {
                debug('Unexpected audio codec: %s', audioCodec);
                audioInfo['codec'] = audioCodec;
            }
        }

        audioInfo['channel'] = audioCodecParamsTLV[StreamController.AudioCodecParamTypes.CHANNEL].readUInt8(0);
        audioInfo['bit_rate'] = audioCodecParamsTLV[StreamController.AudioCodecParamTypes.BIT_RATE].readUInt8(0);

        const sample_rate_enum = audioCodecParamsTLV[StreamController.AudioCodecParamTypes.SAMPLE_RATE].readUInt8(0);
        if (sample_rate_enum !== undefined) {
            if (sample_rate_enum == StreamController.AudioCodecParamSampleRateTypes.KHZ_8) {
                audioInfo['sample_rate'] = 8;
            } else if (sample_rate_enum == StreamController.AudioCodecParamSampleRateTypes.KHZ_16) {
                audioInfo['sample_rate'] = 16;
            } else if (sample_rate_enum == StreamController.AudioCodecParamSampleRateTypes.KHZ_24) {
                audioInfo['sample_rate'] = 24;
            } else {
                debug('Unexpected audio sample rate: %s', sample_rate_enum);
            }
        }

        audioInfo['packet_time'] = audioCodecParamsTLV[StreamController.AudioCodecParamTypes.PACKET_TIME].readUInt8(0);

        const ssrc = audioRTPParamsTLV[StreamController.RTPParamTypes.SYNCHRONIZATION_SOURCE].readUInt32LE(0);
        audioPT = audioRTPParamsTLV[StreamController.RTPParamTypes.PAYLOAD_TYPE].readUInt8(0);

        audioInfo['pt'] = audioPT;
        audioInfo['ssrc'] = ssrc;
        audioInfo['max_bit_rate'] = audioRTPParamsTLV[StreamController.RTPParamTypes.MAX_BIT_RATE].readUInt16LE(0);
        audioInfo['rtcp_interval'] = audioRTPParamsTLV[StreamController.RTPParamTypes.RTCP_SEND_INTERVAL].readUInt32LE(0);
        audioInfo['comfort_pt'] = audioRTPParamsTLV[StreamController.RTPParamTypes.COMFORT_NOISE_PAYLOAD_TYPE].readUInt8(0);

        request['audio'] = audioInfo;
    }

    if (!reconfigure && self.requireProxy) {
        self.videoProxy.setOutgoingPayloadType(videoPT);
        if (!self.disableAudioProxy) {
            self.audioProxy.setOutgoingPayloadType(audioPT);
        }
    }

    self.cameraSource.handleStreamRequest(request);

    self._updateStreamStatus(StreamController.StreamingStatus.STREAMING);
    callback();
};

StreamController.prototype._handleStopStream = function(callback, silent) {
    const self = this;

    const request = {
        'sessionID': self.sessionIdentifier,
        'type': 'stop'
    };

    if (!silent) {
        self.cameraSource.handleStreamRequest(request);
    }

    if (self.requireProxy) {
        self.videoProxy.destroy();
        if (!self.disableAudioProxy) {
            self.audioProxy.destroy();
        }

        self.videoProxy = undefined;
        self.audioProxy = undefined;
    }

    self._updateStreamStatus(StreamController.StreamingStatus.AVAILABLE);

    if (callback) {
        callback();
    }
};

StreamController.prototype._handleSetupWrite = function(value, callback) {
    const self = this;

    const data = bufferShim.from(value, 'base64');
    const objects = tlv.decode(data);

    self.sessionIdentifier = objects[StreamController.SetupTypes.SESSION_ID];

    // Address
    const targetAddressPayload = objects[StreamController.SetupTypes.ADDRESS];
    const processedAddressInfo = tlv.decode(targetAddressPayload);
    const isIPv6 = processedAddressInfo[StreamController.SetupAddressInfo.ADDRESS_VER][0];
    const targetAddress = processedAddressInfo[StreamController.SetupAddressInfo.ADDRESS].toString('utf8');
    const targetVideoPort = processedAddressInfo[StreamController.SetupAddressInfo.VIDEO_RTP_PORT].readUInt16LE(0);
    const targetAudioPort = processedAddressInfo[StreamController.SetupAddressInfo.AUDIO_RTP_PORT].readUInt16LE(0);

    // Video SRTP Params
    const videoSRTPPayload = objects[StreamController.SetupTypes.VIDEO_SRTP_PARAM];
    const processedVideoInfo = tlv.decode(videoSRTPPayload);
    const videoCryptoSuite = processedVideoInfo[StreamController.SetupSRTP_PARAM.CRYPTO][0];
    const videoMasterKey = processedVideoInfo[StreamController.SetupSRTP_PARAM.MASTER_KEY];
    const videoMasterSalt = processedVideoInfo[StreamController.SetupSRTP_PARAM.MASTER_SALT];

    // Audio SRTP Params
    const audioSRTPPayload = objects[StreamController.SetupTypes.AUDIO_SRTP_PARAM];
    const processedAudioInfo = tlv.decode(audioSRTPPayload);
    const audioCryptoSuite = processedAudioInfo[StreamController.SetupSRTP_PARAM.CRYPTO][0];
    const audioMasterKey = processedAudioInfo[StreamController.SetupSRTP_PARAM.MASTER_KEY];
    const audioMasterSalt = processedAudioInfo[StreamController.SetupSRTP_PARAM.MASTER_SALT];

    debug(
        '\nSession: ', this.sessionIdentifier,
        '\nControllerAddress: ', targetAddress,
        '\nVideoPort: ', targetVideoPort,
        '\nAudioPort: ', targetAudioPort,
        '\nVideo Crypto: ', videoCryptoSuite,
        '\nVideo Master Key: ', videoMasterKey,
        '\nVideo Master Salt: ', videoMasterSalt,
        '\nAudio Crypto: ', audioCryptoSuite,
        '\nAudio Master Key: ', audioMasterKey,
        '\nAudio Master Salt: ', audioMasterSalt
    );

    const request = {
        'sessionID': self.sessionIdentifier,
    };

    const videoInfo = {};

    const audioInfo = {};

    if (self.supportSRTP) {
        videoInfo['srtp_key'] = videoMasterKey;
        videoInfo['srtp_salt'] = videoMasterSalt;

        audioInfo['srtp_key'] = audioMasterKey;
        audioInfo['srtp_salt'] = audioMasterSalt;
    }

    if (!self.requireProxy) {
        request['targetAddress'] = targetAddress;

        videoInfo['port'] = targetVideoPort;
        audioInfo['port'] = targetAudioPort;

        request['video'] = videoInfo;
        request['audio'] = audioInfo;

        self.cameraSource.prepareStream(request, function(response) {
            self._generateSetupResponse(self.sessionIdentifier, response, callback);
        });
    } else {
        request['targetAddress'] = ip.address();
        const promises = [];

        const videoSSRCNumber = crypto.randomBytes(4).readUInt32LE(0);
        self.videoProxy = new RTPProxy({
            outgoingAddress: targetAddress,
            outgoingPort: targetVideoPort,
            outgoingSSRC: videoSSRCNumber,
            disabled: false
        });

        promises.push(self.videoProxy.setup());

        if (!self.disableAudioProxy) {
            const audioSSRCNumber = crypto.randomBytes(4).readUInt32LE(0);

            self.audioProxy = new RTPProxy({
                outgoingAddress: targetAddress,
                outgoingPort: targetAudioPort,
                outgoingSSRC: audioSSRCNumber,
                disabled: self.videoOnly
            });

            promises.push(self.audioProxy.setup());
        } else {
            audioInfo['port'] = targetAudioPort;
            audioInfo['targetAddress'] = targetAddress;
        }

        Promise.all(promises).then(function() {
            videoInfo['proxy_rtp'] = self.videoProxy.incomingRTPPort();
            videoInfo['proxy_rtcp'] = self.videoProxy.incomingRTCPPort();

            if (!self.disableAudioProxy) {
                audioInfo['proxy_rtp'] = self.audioProxy.incomingRTPPort();
                audioInfo['proxy_rtcp'] = self.audioProxy.incomingRTCPPort();
            }

            request['video'] = videoInfo;
            request['audio'] = audioInfo;

            self.cameraSource.prepareStream(request, function(response) {
                self._generateSetupResponse(self.sessionIdentifier, response, callback);
            });
        });
    }
};

StreamController.prototype._generateSetupResponse = function(identifier, response, callback) {
    const self = this;

    let ipVer = 0;
    let ipAddress = null;
    const videoPort = bufferShim.alloc(2);
    const audioPort = bufferShim.alloc(2);

    const videoSSRC = bufferShim.alloc(4);
    const audioSSRC = bufferShim.alloc(4);

    let videoSRTP = bufferShim.from([0x01, 0x01, 0x02, 0x02, 0x00, 0x03, 0x00]);
    let audioSRTP = bufferShim.from([0x01, 0x01, 0x02, 0x02, 0x00, 0x03, 0x00]);

    if (self.requireProxy) {
        const currentAddress = ip.address();

        ipVer = 1;

        if (ip.isV4Format(currentAddress)) {
            ipVer = 0;
        }

        ipAddress = bufferShim.from(currentAddress);
        videoPort.writeUInt16LE(self.videoProxy.outgoingLocalPort(), 0);

        if (!self.disableAudioProxy) {
            audioPort.writeUInt16LE(self.audioProxy.outgoingLocalPort(), 0);
        }

        const videoInfo = response['video'];

        const video_pt = videoInfo['proxy_pt'];
        const video_serverAddr = videoInfo['proxy_server_address'];
        const video_serverRTP = videoInfo['proxy_server_rtp'];
        const video_serverRTCP = videoInfo['proxy_server_rtcp'];

        self.videoProxy.setIncomingPayloadType(video_pt);
        self.videoProxy.setServerAddress(video_serverAddr);
        self.videoProxy.setServerRTPPort(video_serverRTP);
        self.videoProxy.setServerRTCPPort(video_serverRTCP);

        videoSSRC.writeUInt32LE(self.videoProxy.outgoingSSRC, 0);

        const audioInfo = response['audio'];

        if (!self.disableAudioProxy) {
            const audio_pt = audioInfo['proxy_pt'];
            const audio_serverAddr = audioInfo['proxy_server_address'];
            const audio_serverRTP = audioInfo['proxy_server_rtp'];
            const audio_serverRTCP = audioInfo['proxy_server_rtcp'];

            self.audioProxy.setIncomingPayloadType(audio_pt);
            self.audioProxy.setServerAddress(audio_serverAddr);
            self.audioProxy.setServerRTPPort(audio_serverRTP);
            self.audioProxy.setServerRTCPPort(audio_serverRTCP);

            audioSSRC.writeUInt32LE(self.audioProxy.outgoingSSRC, 0);
        } else {
            audioPort.writeUInt16LE(audioInfo['port'], 0);
            audioSSRC.writeUInt32LE(audioInfo['ssrc'], 0);
        }

    } else {
        const addressInfo = response['address'];

        if (addressInfo['type'] == 'v6') {
            ipVer = 1;
        } else {
            ipVer = 0;
        }

        ipAddress = addressInfo['address'];

        const videoInfo = response['video'];
        videoPort.writeUInt16LE(videoInfo['port'], 0);
        videoSSRC.writeUInt32LE(videoInfo['ssrc'], 0);

        const audioInfo = response['audio'];
        audioPort.writeUInt16LE(audioInfo['port'], 0);
        audioSSRC.writeUInt32LE(audioInfo['ssrc'], 0);

        if (self.supportSRTP) {
            const videoKey = videoInfo['srtp_key'];
            const videoSalt = videoInfo['srtp_salt'];

            const audioKey = audioInfo['srtp_key'];
            const audioSalt = audioInfo['srtp_salt'];

            videoSRTP = tlv.encode(
                StreamController.SetupSRTP_PARAM.CRYPTO, StreamController.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
                StreamController.SetupSRTP_PARAM.MASTER_KEY, videoKey,
                StreamController.SetupSRTP_PARAM.MASTER_SALT, videoSalt
            );

            audioSRTP = tlv.encode(
                StreamController.SetupSRTP_PARAM.CRYPTO, StreamController.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
                StreamController.SetupSRTP_PARAM.MASTER_KEY, audioKey,
                StreamController.SetupSRTP_PARAM.MASTER_SALT, audioSalt
            );
        }
    }

    const addressTLV = tlv.encode(
        StreamController.SetupAddressInfo.ADDRESS_VER, ipVer,
        StreamController.SetupAddressInfo.ADDRESS, ipAddress,
        StreamController.SetupAddressInfo.VIDEO_RTP_PORT, videoPort,
        StreamController.SetupAddressInfo.AUDIO_RTP_PORT, audioPort
    );

    const responseTLV = tlv.encode(
        StreamController.SetupTypes.SESSION_ID, identifier,
        StreamController.SetupTypes.STATUS, StreamController.SetupStatus.SUCCESS,
        StreamController.SetupTypes.ADDRESS, addressTLV,
        StreamController.SetupTypes.VIDEO_SRTP_PARAM, videoSRTP,
        StreamController.SetupTypes.AUDIO_SRTP_PARAM, audioSRTP,
        StreamController.SetupTypes.VIDEO_SSRC, videoSSRC,
        StreamController.SetupTypes.AUDIO_SSRC, audioSSRC
    );

    self.setupResponse = responseTLV.toString('base64');
    callback();
};

StreamController.prototype._updateStreamStatus = function(status) {
    const self = this;

    self.streamStatus = status;

    self.service
        .getCharacteristic(Characteristic.StreamingStatus)
        .setValue(tlv.encode( 0x01, self.streamStatus ).toString('base64'));
};

StreamController.prototype._handleSetupRead = function(callback) {
    debug('Setup Read');
    callback(null, this.setupResponse);
};

StreamController.prototype._supportedRTPConfiguration = function(supportSRTP) {
    let cryptoSuite = StreamController.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80;

    if (!supportSRTP) {
        cryptoSuite = StreamController.SRTPCryptoSuites.NONE;
        debug('Client claims it doesn\'t support SRTP. The stream may stops working with future iOS releases.');
    }

    return tlv.encode(
        StreamController.RTPConfigTypes.CRYPTO, cryptoSuite
    ).toString('base64');
};

StreamController.prototype._supportedVideoStreamConfiguration = function(videoParams) {
    const self = this;

    const codec = videoParams['codec'];
    if (!codec) {
        throw new Error('Video codec cannot be undefined');
    }

    let videoCodecParamsTLV = tlv.encode(
        StreamController.VideoCodecParamTypes.PACKETIZATION_MODE, StreamController.VideoCodecParamPacketizationModeTypes.NON_INTERLEAVED
    );

    const profiles = codec['profiles'];
    profiles.forEach(function(value) {
        const tlvBuffer = tlv.encode(StreamController.VideoCodecParamTypes.PROFILE_ID, value);
        videoCodecParamsTLV = Buffer.concat([videoCodecParamsTLV, tlvBuffer]);
    });

    const levels = codec['levels'];
    levels.forEach(function(value) {
        const tlvBuffer = tlv.encode(StreamController.VideoCodecParamTypes.LEVEL, value);
        videoCodecParamsTLV = Buffer.concat([videoCodecParamsTLV, tlvBuffer]);
    });

    const resolutions = videoParams['resolutions'];
    if (!resolutions) {
        throw new Error('Video resolutions cannot be undefined');
    }

    let videoAttrsTLV = bufferShim.alloc(0);
    resolutions.forEach(function(resolution) {
        if (resolution.length != 3) {
            throw new Error('Unexpected video resolution');
        }

        const imageWidth = bufferShim.alloc(2);
        imageWidth.writeUInt16LE(resolution[0], 0);
        const imageHeight = bufferShim.alloc(2);
        imageHeight.writeUInt16LE(resolution[1], 0);
        const frameRate = bufferShim.alloc(1);
        frameRate.writeUInt8(resolution[2]);

        const videoAttrTLV = tlv.encode(
            StreamController.VideoAttributesTypes.IMAGE_WIDTH, imageWidth,
            StreamController.VideoAttributesTypes.IMAGE_HEIGHT, imageHeight,
            StreamController.VideoAttributesTypes.FRAME_RATE, frameRate
        );
        const videoAttrBuffer = tlv.encode(StreamController.VideoTypes.ATTRIBUTES, videoAttrTLV);
        videoAttrsTLV = Buffer.concat([videoAttrsTLV, videoAttrBuffer]);
    });

    const configurationTLV = tlv.encode(
        StreamController.VideoTypes.CODEC, StreamController.VideoCodecTypes.H264,
        StreamController.VideoTypes.CODEC_PARAM, videoCodecParamsTLV
    );

    return tlv.encode(
        0x01, Buffer.concat([configurationTLV, videoAttrsTLV])
    ).toString('base64');
};

StreamController.prototype._supportedAudioStreamConfiguration = function(audioParams) {
    // Only AACELD and OPUS are accepted by iOS currently, and we need to give it something it will accept
    // for it to start the video stream.

    const self = this;
    let comfortNoiseValue = 0x00;

    if (audioParams['comfort_noise'] === true) {
        comfortNoiseValue = 0x01;
    }

    const codecs = audioParams['codecs'];
    if (!codecs) {
        throw new Error('Audio codecs cannot be undefined');
    }

    let audioConfigurationsBuffer = bufferShim.alloc(0);
    let hasSupportedCodec = false;

    codecs.forEach(function(codecParam){
        let codec = StreamController.AudioCodecTypes.OPUS;
        let bitrate = StreamController.AudioCodecParamBitRateTypes.CONSTANT;
        let samplerate = StreamController.AudioCodecParamSampleRateTypes.KHZ_24;

        const param_type = codecParam['type'];
        const param_samplerate = codecParam['samplerate'];

        if (param_type == 'OPUS') {
            hasSupportedCodec = true;
            bitrate = StreamController.AudioCodecParamBitRateTypes.VARIABLE;
        } else if (param_type == 'AAC-eld') {
            hasSupportedCodec = true;
            codec = StreamController.AudioCodecTypes.AACELD;
            bitrate = StreamController.AudioCodecParamBitRateTypes.VARIABLE;
        } else {
            debug('Unsupported codec: ', param_type);
            return;
        }

        if (param_samplerate == 8) {
            samplerate = StreamController.AudioCodecParamSampleRateTypes.KHZ_8;
        } else if (param_samplerate == 16) {
            samplerate = StreamController.AudioCodecParamSampleRateTypes.KHZ_16;
        } else if (param_samplerate == 24) {
            samplerate = StreamController.AudioCodecParamSampleRateTypes.KHZ_24;
        } else {
            debug('Unsupported sample rate: ', param_samplerate);
            return;
        }

        const audioParamTLV = tlv.encode(
            StreamController.AudioCodecParamTypes.CHANNEL, 1,
            StreamController.AudioCodecParamTypes.BIT_RATE, bitrate,
            StreamController.AudioCodecParamTypes.SAMPLE_RATE, samplerate
        );

        const audioConfiguration = tlv.encode(
            StreamController.AudioTypes.CODEC, codec,
            StreamController.AudioTypes.CODEC_PARAM, audioParamTLV
        );

        audioConfigurationsBuffer = Buffer.concat([audioConfigurationsBuffer, tlv.encode(0x01, audioConfiguration)]);
    });

    // If we're not one of the supported codecs
    if(!hasSupportedCodec) {
        debug('Client doesn\'t support any audio codec that HomeKit supports.');

        const codec = StreamController.AudioCodecTypes.OPUS;
        const bitrate = StreamController.AudioCodecParamBitRateTypes.VARIABLE;
        const samplerate = StreamController.AudioCodecParamSampleRateTypes.KHZ_24;

        const audioParamTLV = tlv.encode(
            StreamController.AudioCodecParamTypes.CHANNEL, 1,
            StreamController.AudioCodecParamTypes.BIT_RATE, bitrate,
            StreamController.AudioCodecParamTypes.SAMPLE_RATE, StreamController.AudioCodecParamSampleRateTypes.KHZ_24
        );


        const audioConfiguration = tlv.encode(
            StreamController.AudioTypes.CODEC, codec,
            StreamController.AudioTypes.CODEC_PARAM, audioParamTLV
        );

        audioConfigurationsBuffer = tlv.encode(0x01, audioConfiguration);

        self.videoOnly = true;
    }

    return Buffer.concat([audioConfigurationsBuffer, tlv.encode(0x02, comfortNoiseValue)]).toString('base64');
};
