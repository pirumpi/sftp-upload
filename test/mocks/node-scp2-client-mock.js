// test/mocks/node-scp2-client-mock.js
const EventEmitter = require('events');
const util = require('util');

function NodeScp2ClientMock(config) {
    EventEmitter.call(this);
    this.config = config;
    this.calls = {
        upload: [],
        close: 0,
    };
    this.forceError = null; // General error for operations
    this.forceUploadError = null; // Specific error for upload

    // Simulate async connection for 'connect' event
    process.nextTick(() => {
        if (this.config.host === 'force_connection_error') { // Example way to force conn error
             this.emit('error', new Error('Mocked connection error from node-scp2'));
        } else {
            this.emit('connect');
        }
    });
}
util.inherits(NodeScp2ClientMock, EventEmitter);

NodeScp2ClientMock.prototype.upload = function(localPath, remotePath, callback) {
    this.calls.upload.push({ localPath, remotePath });
    if (this.forceUploadError) {
        const err = this.forceUploadError;
        this.forceUploadError = null; // Reset after use
        return process.nextTick(() => callback(err));
    }
    if (this.forceError) {
        const err = this.forceError;
        // this.forceError = null; // Don't reset general error
        return process.nextTick(() => callback(err));
    }
    // Simulate progress for sftp-upload's 'transfer' listener on node-scp2 client
    // sftp-upload's 'uploading' event comes from client.on('transfer', ...)
    // node-scp2's client emits 'transfer' with (buffer, M, N) where M is current, N is total
    // This is a simplified simulation.
    const dummyBuffer = Buffer.from('data');
    const totalSize = 100;
    this.emit('transfer', dummyBuffer, 50, totalSize); // 50%
    this.emit('transfer', dummyBuffer, totalSize, totalSize); // 100%
    
    process.nextTick(() => callback(null)); // Simulate successful upload
};

NodeScp2ClientMock.prototype.close = function() {
    this.calls.close++;
    this.emit('close'); // Or 'end' if that's what sftp-upload expects
};

// Helper for tests
NodeScp2ClientMock.prototype.reset = function() {
    this.calls = { upload: [], close: 0 };
    this.forceError = null;
    this.forceUploadError = null;
};

module.exports = NodeScp2ClientMock;
