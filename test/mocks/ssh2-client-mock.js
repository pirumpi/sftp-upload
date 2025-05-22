// test/mocks/ssh2-client-mock.js
const EventEmitter = require('events');
const util = require('util');

function SftpMock() {
    EventEmitter.call(this);
    this.calls = { // To track calls for assertions
        unlink: [],
        mkdir: [],
        fastPut: [],
        end: 0,
    };
    this.forceError = null; // Set to an error message to force an error for the next op
    this.forceSpecificError = {}; // e.g. { unlink: 'unlink error message' }
}
util.inherits(SftpMock, EventEmitter);

SftpMock.prototype.unlink = function(path, callback) {
    this.calls.unlink.push({ path });
    if (this.forceSpecificError.unlink) {
        const err = new Error(this.forceSpecificError.unlink);
        this.forceSpecificError.unlink = null; // Reset after use
        return callback(err);
    }
    if (this.forceError) {
        const err = new Error(this.forceError);
        return callback(err);
    }
    if (path.includes('nonexistent')) {
         return callback(new Error('SFTP_ERROR: No such file or directory'));
    }
    callback(null);
};

SftpMock.prototype.mkdir = function(path, attributes, callback) {
    if (typeof attributes === 'function') {
        callback = attributes;
        attributes = undefined;
    }
    this.calls.mkdir.push({ path, attributes });
     if (this.forceSpecificError.mkdir) {
        const err = new Error(this.forceSpecificError.mkdir);
        this.forceSpecificError.mkdir = null;
        return callback(err);
    }
    if (this.forceError) {
        return callback(new Error(this.forceError));
    }
    callback(null);
};

SftpMock.prototype.fastPut = function(localPath, remotePath, options, callback) {
    this.calls.fastPut.push({ localPath, remotePath, options });
     if (this.forceSpecificError.fastPut) {
        const err = new Error(this.forceSpecificError.fastPut);
        this.forceSpecificError.fastPut = null;
        return callback(err);
    }
    if (this.forceError) {
        return callback(new Error(this.forceError));
    }
    callback(null);
};

SftpMock.prototype.end = function() {
    this.calls.end++;
    this.emit('end');
};

SftpMock.prototype.reset = function() {
    this.calls = { unlink: [], mkdir: [], fastPut: [], end: 0 };
    this.forceError = null;
    this.forceSpecificError = {};
};

function SSH2ClientMock() {
    EventEmitter.call(this);
    this.config = null;
    this.sftpMockInstance = new SftpMock();
    this.connectionError = null;
    this.sftpError = null;
}
util.inherits(SSH2ClientMock, EventEmitter);

SSH2ClientMock.prototype.connect = function(config) {
    this.config = config;
    if (this.connectionError) {
        this.emit('error', new Error(this.connectionError));
        return;
    }
    process.nextTick(() => {
        this.emit('ready');
    });
};

SSH2ClientMock.prototype.sftp = function(callback) {
    if (this.sftpError) {
        return callback(new Error(this.sftpError));
    }
    callback(null, this.sftpMockInstance);
};

SSH2ClientMock.prototype.end = function() {
    process.nextTick(() => {
        this.emit('close');
    });
};

SSH2ClientMock.prototype.resetAll = function() {
    this.connectionError = null;
    this.sftpError = null;
    this.sftpMockInstance.reset();
};

module.exports = { SSH2ClientMock, SftpMock };
