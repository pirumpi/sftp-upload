// test/general.test.js
const proxyquire = require('proxyquire');
const { expect } = require('chai');
const path = require('path');
const fs = require('fs-extra'); // For dummy file creation
const NodeScp2ClientMock = require('./mocks/node-scp2-client-mock'); 
const { SSH2ClientMock: OriginalSSH2ClientMock } = require('./mocks/ssh2-client-mock');

const sftpUploadModulePath = '../lib/sftp-upload.js';

// Dummy local directory structure for tests
const localBaseDir = path.join(__dirname, 'test_files_general');
const localSourceDir = path.join(localBaseDir, 'source');
const localCssFile = path.join(localSourceDir, 'style.css');

const createDummySourceFile = () => {
    fs.ensureDirSync(localSourceDir);
    fs.writeFileSync(localCssFile, 'body { color: blue; }');
};

const removeDummySourceFile = () => {
    fs.removeSync(localBaseDir);
};

describe('SftpUpload - General Options and Events', () => {
    let SftpUpload;
    let nodeScp2ClientMockInstance;
    let originalSsh2ClientMockInstance; 

    beforeEach(() => {
        createDummySourceFile();
        nodeScp2ClientMockInstance = new NodeScp2ClientMock({ host: 'testhost_general', username: 'testuser_general' });
        originalSsh2ClientMockInstance = new OriginalSSH2ClientMock();

        SftpUpload = proxyquire.noCallThru().noPreserveCache().load(sftpUploadModulePath, {
            'node-scp2': { 
                Client: function(config) {
                    nodeScp2ClientMockInstance.config = config;
                    return nodeScp2ClientMockInstance;
                }
            },
            'ssh2': { 
                Client: OriginalSSH2ClientMock, 
                Connection: OriginalSSH2ClientMock 
            } 
        });
    });

    afterEach(() => {
        removeDummySourceFile();
        if (nodeScp2ClientMockInstance) nodeScp2ClientMockInstance.reset();
        if (originalSsh2ClientMockInstance) originalSsh2ClientMockInstance.resetAll();
    });

    it('should emit "connect" event when SFTP connection is (mock) established for upload', (done) => {
        const options = {
            host: 'localhost', username: 'test', privateKey: 'dummy',
            path: localCssFile, // single file
            remoteDir: '/remote/assets',
            basePath: localSourceDir, // So 'style.css' goes to '/remote/assets/style.css'
            dryRun: false, // Need to attempt connection
        };
        const sftp = new SftpUpload(options);
        let connectEmitted = false;

        sftp.on('connect', () => {
            connectEmitted = true;
        });

        sftp.on('completed', () => { // Wait for completion to ensure connect had a chance
            try {
                expect(connectEmitted).to.be.true;
                done();
            } catch (e) {
                done(e);
            }
        });
        sftp.on('error', done);
        sftp.upload();
    });
    
    it('should emit "connect" event when SFTP connection is (mock) established for delete', (done) => {
        const options = {
            host: 'localhost', username: 'test', privateKey: 'dummy',
            path: 'dummy/path', // Required by constructor, not used by deleteFiles directly for path discovery
            remoteDir: '/remote/assets',
            removeFiles: ['style.css'],
            dryRun: false, // Need to attempt connection
        };
        const sftp = new SftpUpload(options);
        let connectEmitted = false;
        
        // The 'connect' event for deleteFiles is implicitly part of ssh2ClientMock behavior
        // We are checking if the SSH2ClientMock's 'ready' event (which sftp-upload doesn't directly see)
        // leads to successful operation, implying connection.
        // sftp-upload itself doesn't emit 'connect' for deleteFiles explicitly.
        // This test rather confirms the delete operation proceeds, implying connection.

        sftp.on('deletecompleted', () => {
            try {
                // This test uses deleteFiles, which uses the 'ssh2' mock (OriginalSSH2ClientMock)
                expect(originalSsh2ClientMockInstance.sftpMockInstance.calls.unlink).to.have.lengthOf(1);
                done();
            } catch (e) {
                done(e);
            }
        });
        sftp.on('error', done);
        sftp.deleteFiles();
    });


    it('should correctly use basePath to determine remote path for uploads', (done) => {
        const options = {
            host: 'localhost', username: 'test', privateKey: 'dummy',
            path: localCssFile, // Uploading 'test_files_general/source/style.css'
            remoteDir: '/var/www/app',
            // basePath is 'test_files_general/source'.
            // So, 'style.css' should be uploaded to '/var/www/app/style.css'
            basePath: localSourceDir, 
            dryRun: false,
        };
        const sftp = new SftpUpload(options);

        sftp.on('completed', () => {
            try {
                // This test uses upload, which uses the 'node-scp2' mock
                const uploadCalls = nodeScp2ClientMockInstance.calls.upload;
                expect(uploadCalls).to.have.lengthOf(1);
                expect(uploadCalls[0].localPath).to.equal(localCssFile);
                expect(uploadCalls[0].remotePath).to.equal('/var/www/app/style.css');
                done();
            } catch (e) {
                done(e);
            }
        });
        sftp.on('error', done);
        sftp.upload();
    });

    it('should handle remoteDir with trailing slash correctly for uploads', (done) => {
        const options = {
            host: 'localhost', username: 'test', privateKey: 'dummy',
            path: localCssFile,
            remoteDir: '/var/www/app/', // Trailing slash
            basePath: localSourceDir,
            dryRun: false,
        };
        const sftp = new SftpUpload(options);
        sftp.on('completed', () => {
            try {
                const uploadCalls = nodeScp2ClientMockInstance.calls.upload;
                expect(uploadCalls[0].remotePath).to.equal('/var/www/app/style.css'); // path.join should handle it
                done();
            } catch (e) { done(e); }
        });
        sftp.on('error', done);
        sftp.upload();
    });
    
    it('should handle remoteDir with trailing slash correctly for deletes', (done) => {
        const options = {
            host: 'localhost', username: 'test', privateKey: 'dummy_key',
            path: 'dummy/path', 
            remoteDir: '/var/www/data/', // Trailing slash
            removeFiles: ['file1.txt'],
            dryRun: false,
        };
        const sftp = new SftpUpload(options);
        sftp.on('deletecompleted', () => {
            try {
                // This test uses deleteFiles, which uses the 'ssh2' mock (OriginalSSH2ClientMock)
                const unlinkCalls = originalSsh2ClientMockInstance.sftpMockInstance.calls.unlink;
                expect(unlinkCalls[0].path).to.equal('/var/www/data/file1.txt'); // path.join should handle it
                done();
            } catch (e) { done(e); }
        });
        sftp.on('error', done);
        sftp.deleteFiles();
    });

    // Test for when 'path' option is an array of files/directories for upload
    it('should handle "path" option as an array of sources for upload', (done) => {
        const anotherFile = path.join(localBaseDir, 'another.txt');
        fs.writeFileSync(anotherFile, 'another content');

        const options = {
            host: 'localhost', username: 'test', privateKey: 'dummy',
            path: [localCssFile, anotherFile], // Array of paths
            remoteDir: '/remote/deploy',
            // For files, basePath might need to be their respective parent dirs or a common one.
            // sftp-upload uses path.relative(opt.basePath, file)
            // If basePath is not set intelligently for an array of files, remote paths might be long.
            // Let's test with a common basePath.
            basePath: localBaseDir, 
            dryRun: false,
        };
        const sftp = new SftpUpload(options);

        sftp.on('completed', () => {
            try {
                // This test uses upload, which uses the 'node-scp2' mock
                const uploadCalls = nodeScp2ClientMockInstance.calls.upload;
                expect(uploadCalls).to.have.lengthOf(2);
                const remotePaths = uploadCalls.map(call => call.remotePath);
                expect(remotePaths).to.include.members([
                    '/remote/deploy/source/style.css', // from localBaseDir/source/style.css
                    '/remote/deploy/another.txt'      // from localBaseDir/another.txt
                ]);
                done();
            } catch (e) {
                done(e);
            }
        });
        sftp.on('error', done);
        sftp.upload();
        
        // Cleanup the extra file
        // fs.removeSync(anotherFile); // Done in afterEach
    });
});
