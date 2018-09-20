

const debug = require('debug')('Camera');
const {inherits} = require('util');
const {EventEmitter} = require('events');
const {clone} = require('./util/clone');
const uuid = require('./util/uuid');
const {Service} = require('./Service');
const {Characteristic} = require('./Characteristic');
const {StreamController} = require('./StreamController');
const HomeKitTypes = require('./gen/HomeKitTypes');

const crypto = require('crypto');
const fs = require('fs');
const ip = require('ip');
const spawn = require('child_process').spawn;

function Camera() {
    this.services = [];
    this.streamControllers = [];

    this.pendingSessions = {};
    this.ongoingSessions = {};

    const options = {
        proxy: false, // Requires RTP/RTCP MUX Proxy
        disable_audio_proxy: false, // If proxy = true, you can opt out audio proxy via this
        srtp: true, // Supports SRTP AES_CM_128_HMAC_SHA1_80 encryption
        video: {
            resolutions: [
                [1920, 1080, 30], // Width, Height, framerate
                [320, 240, 15], // Apple Watch requires this configuration
                [1280, 960, 30],
                [1280, 720, 30],
                [1024, 768, 30],
                [640, 480, 30],
                [640, 360, 30],
                [480, 360, 30],
                [480, 270, 30],
                [320, 240, 30],
                [320, 180, 30]
            ],
            codec: {
                profiles: [0, 1, 2], // Enum, please refer StreamController.VideoCodecParamProfileIDTypes
                levels: [0, 1, 2] // Enum, please refer StreamController.VideoCodecParamLevelTypes
            }
        },
        audio: {
            comfort_noise: false,
            codecs: [
                {
                    type: 'OPUS', // Audio Codec
                    samplerate: 24 // 8, 16, 24 KHz
                },
                {
                    type: 'AAC-eld',
                    samplerate: 16
                }
            ]
        }
    };

    this.createCameraControlService();
    this._createStreamControllers(2, options);
}

Camera.prototype.handleSnapshotRequest = function(request, callback) {
    // Image request: {width: number, height: number}
    // Please override this and invoke callback(error, image buffer) when the snapshot is ready

    const snapshot = fs.readFileSync(__dirname + '/res/snapshot.jpg');
    callback(undefined, snapshot);
};

Camera.prototype.handleCloseConnection = function(connectionID) {
    this.streamControllers.forEach(function(controller) {
        controller.handleCloseConnection(connectionID);
    });
};

Camera.prototype.prepareStream = function(request, callback) {
    // Invoked when iOS device requires stream

    const sessionInfo = {};

    const sessionID = request['sessionID'];
    const targetAddress = request['targetAddress'];

    sessionInfo['address'] = targetAddress;

    const response = {};

    const videoInfo = request['video'];
    if (videoInfo) {
        const targetPort = videoInfo['port'];
        const srtp_key = videoInfo['srtp_key'];
        const srtp_salt = videoInfo['srtp_salt'];

        // SSRC is a 32 bit integer that is unique per stream
        const ssrcSource = crypto.randomBytes(4);
        ssrcSource[0] = 0;
        const ssrc = ssrcSource.readInt32BE(0, true);

        const videoResp = {
            port: targetPort,
            ssrc: ssrc,
            srtp_key: srtp_key,
            srtp_salt: srtp_salt
        };

        response['video'] = videoResp;

        sessionInfo['video_port'] = targetPort;
        sessionInfo['video_srtp'] = Buffer.concat([srtp_key, srtp_salt]);
        sessionInfo['video_ssrc'] = ssrc;
    }

    const audioInfo = request['audio'];
    if (audioInfo) {
        const targetPort = audioInfo['port'];
        const srtp_key = audioInfo['srtp_key'];
        const srtp_salt = audioInfo['srtp_salt'];

        // SSRC is a 32 bit integer that is unique per stream
        const ssrcSource = crypto.randomBytes(4);
        ssrcSource[0] = 0;
        const ssrc = ssrcSource.readInt32BE(0, true);

        const audioResp = {
            port: targetPort,
            ssrc: ssrc,
            srtp_key: srtp_key,
            srtp_salt: srtp_salt
        };

        response['audio'] = audioResp;

        sessionInfo['audio_port'] = targetPort;
        sessionInfo['audio_srtp'] = Buffer.concat([srtp_key, srtp_salt]);
        sessionInfo['audio_ssrc'] = ssrc;
    }

    const currentAddress = ip.address();
    const addressResp = {
        address: currentAddress
    };

    if (ip.isV4Format(currentAddress)) {
        addressResp['type'] = 'v4';
    } else {
        addressResp['type'] = 'v6';
    }

    response['address'] = addressResp;
    this.pendingSessions[uuid.unparse(sessionID)] = sessionInfo;

    callback(response);
};

Camera.prototype.handleStreamRequest = function(request) {
    // Invoked when iOS device asks stream to start/stop/reconfigure
    const sessionID = request['sessionID'];
    const requestType = request['type'];
    if (sessionID) {
        const sessionIdentifier = uuid.unparse(sessionID);

        if (requestType == 'start') {
            const sessionInfo = this.pendingSessions[sessionIdentifier];
            if (sessionInfo) {
                let width = 1280;
                let height = 720;
                let fps = 30;
                let bitrate = 300;

                const videoInfo = request['video'];
                if (videoInfo) {
                    width = videoInfo['width'];
                    height = videoInfo['height'];

                    const expectedFPS = videoInfo['fps'];
                    if (expectedFPS < fps) {
                        fps = expectedFPS;
                    }

                    bitrate = videoInfo['max_bit_rate'];
                }

                const targetAddress = sessionInfo['address'];
                const targetVideoPort = sessionInfo['video_port'];
                const videoKey = sessionInfo['video_srtp'];
                const videoSsrc = sessionInfo['video_ssrc'];

                const ffmpegCommand = '-re -f avfoundation -r 29.970000 -i 0:0 -threads 0 -vcodec libx264 -an -pix_fmt yuv420p -r '+ fps +' -f rawvideo -tune zerolatency -vf scale='+ width +':'+ height +' -b:v '+ bitrate +'k -bufsize '+ bitrate +'k -payload_type 99 -ssrc '+ videoSsrc +' -f rtp -srtp_out_suite AES_CM_128_HMAC_SHA1_80 -srtp_out_params '+videoKey.toString('base64')+' srtp://'+targetAddress+':'+targetVideoPort+'?rtcpport='+targetVideoPort+'&localrtcpport='+targetVideoPort+'&pkt_size=1378';
                const ffmpeg = spawn('ffmpeg', ffmpegCommand.split(' '), {env: process.env});
                this.ongoingSessions[sessionIdentifier] = ffmpeg;
            }

            delete this.pendingSessions[sessionIdentifier];
        } else if (requestType == 'stop') {
            const ffmpegProcess = this.ongoingSessions[sessionIdentifier];
            if (ffmpegProcess) {
                ffmpegProcess.kill('SIGKILL');
            }

            delete this.ongoingSessions[sessionIdentifier];
        }
    }
};

Camera.prototype.createCameraControlService = function() {
    const controlService = new Service.CameraControl();

    // Developer can add control characteristics like rotation, night vision at here.

    this.services.push(controlService);
};

// Private

Camera.prototype._createStreamControllers = function(maxStreams, options) {
    const self = this;

    for (let i = 0; i < maxStreams; i++) {
        const streamController = new StreamController(i, options, self);

        self.services.push(streamController.service);
        self.streamControllers.push(streamController);
    }
};

module.exports = {
    Camera: Camera
};
