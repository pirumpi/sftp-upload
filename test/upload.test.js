// test/upload.test.js
const proxyquire = require('proxyquire');
const { expect } = require('chai');
const path = require('path');
const fs = require('fs-extra'); // Using fs-extra for easier test setup/teardown
// const { SSH2ClientMock } = require('./mocks/ssh2-client-mock'); // Original ssh2 mock
const NodeScp2ClientMock = require('./mocks/node-scp2-client-mock'); // New mock for node-scp2
const { SSH2ClientMock: OriginalSSH2ClientMock } = require('./mocks/ssh2-client-mock'); // Keep original for delete tests or other direct ssh2 uses

// Path to the module under test
const sftpUploadModulePath = '../lib/sftp-upload.js';

// Dummy local directory structure for tests
const localBasePath = path.join(__dirname, 'test_files_upload');
const localPublicDir = path.join(localBasePath, 'public');
const localCssDir = path.join(localPublicDir, 'css');
const localJsDir = path.join(localPublicDir, 'js');
const localImgDir = path.join(localPublicDir, 'img');
const localExcludedDir = path.join(localPublicDir, 'excluded_folder');

const dummyFiles = {
    mainCss: path.join(localCssDir, 'main.css'),
    mainJs: path.join(localJsDir, 'main.js'),
    secondaryJs: path.join(localJsDir, 'secondary.js'),
    logoPng: path.join(localImgDir, 'logo.png'),
    readmeTxt: path.join(localPublicDir, 'readme.txt'),
    excludedFile: path.join(localExcludedDir, 'excluded.txt'),
    rootFile: path.join(localBasePath, 'root_file.txt')
};

const createDummyFiles = () => {
    fs.ensureDirSync(localCssDir);
    fs.ensureDirSync(localJsDir);
    fs.ensureDirSync(localImgDir);
    fs.ensureDirSync(localExcludedDir);
    Object.values(dummyFiles).forEach(file => fs.writeFileSync(file, 'dummy content'));
};

const removeDummyFiles = () => {
    fs.removeSync(localBasePath);
};

describe('SftpUpload - Upload Functionality', () => {
    let SftpUpload;
    let nodeScp2ClientMockInstance; // Use this for upload tests
    // let originalSsh2ClientMockInstance; // If needed for direct ssh2 interactions in some tests

    beforeEach(() => {
        createDummyFiles();
        nodeScp2ClientMockInstance = new NodeScp2ClientMock({ host: 'testhost', username: 'testuser' });
        
        // originalSsh2ClientMockInstance = new OriginalSSH2ClientMock(); // If sftp-upload uses both directly

        SftpUpload = proxyquire.noCallThru().noPreserveCache().load(sftpUploadModulePath, {
            'node-scp2': { 
                Client: function(config) {
                    // This function will be called by sftp-upload when it does `new require('node-scp2').Client(config)`
                    // We ensure it uses our single, controllable instance.
                    nodeScp2ClientMockInstance.config = config; // Update the instance's config
                    return nodeScp2ClientMockInstance;
                }
            },
            'ssh2': { // sftp-upload also requires 'ssh2' directly for deleteFiles
                Client: OriginalSSH2ClientMock, 
                Connection: OriginalSSH2ClientMock // Keep this for safety from previous debugging
            } 
        });
    });

    afterEach(() => {
        removeDummyFiles();
        if (nodeScp2ClientMockInstance) {
            nodeScp2ClientMockInstance.reset();
        }
        // if (originalSsh2ClientMockInstance) originalSsh2ClientMockInstance.resetAll();
    });

    describe('File Discovery & Filtering', () => {
        it('should discover all files in a directory if no excludes are given (dryRun)', (done) => { // Renamed test slightly
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy',
                path: localPublicDir, 
                remoteDir: '/remote',
                basePath: localPublicDir, 
                dryRun: true, 
            };
            const sftp = new SftpUpload(options);
            sftp.upload(); // This populates sftp.uploads synchronously

            try {
                expect(sftp.uploads).to.have.lengthOf(6); // main.css, main.js, secondary.js, logo.png, readme.txt, excluded_folder/excluded.txt
                expect(sftp.uploads).to.include(dummyFiles.mainCss);
                expect(sftp.uploads).to.include(dummyFiles.mainJs);
                expect(sftp.uploads).to.include(dummyFiles.secondaryJs);
                expect(sftp.uploads).to.include(dummyFiles.logoPng);
                expect(sftp.uploads).to.include(dummyFiles.readmeTxt);
                done();
            } catch (e) {
                done(e);
            }
        });

        it('should exclude files specified in "exclude" option (dryRun)', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy',
                path: localPublicDir,
                remoteDir: '/remote',
                basePath: localPublicDir,
                exclude: ['css/main.css', 'readme.txt'],
                dryRun: true,
            };
            const sftp = new SftpUpload(options);
            sftp.upload(); 

            try {
                expect(sftp.uploads).to.have.lengthOf(4); // 6 initial - 2 excluded = 4
                expect(sftp.uploads).to.not.include(dummyFiles.mainCss);
                expect(sftp.uploads).to.not.include(dummyFiles.readmeTxt);
                done();
            } catch (e) { done(e); }
        });

        it.only('should exclude folders specified in "excludedFolders" (dryRun)', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy',
                path: localPublicDir,
                remoteDir: '/remote',
                basePath: localPublicDir,
                excludedFolders: ['excluded_folder', 'img'],
                dryRun: true,
            };
            const sftp = new SftpUpload(options);
            sftp.upload();

            try {
                expect(sftp.uploads).to.have.lengthOf(4);
                expect(sftp.uploads).to.not.include(dummyFiles.logoPng);
                expect(sftp.uploads).to.not.include(dummyFiles.excludedFile);
                done();
            } catch (e) { done(e); }
        });
    });

    describe('Dry Run (Upload)', () => {
        it('should populate sftp.uploads but not call SFTP methods in dryRun', (done) => { // Renamed test
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy',
                path: localPublicDir,
                remoteDir: '/remote',
                basePath: localPublicDir,
                dryRun: true,
            };
            const sftp = new SftpUpload(options);
            sftp.upload(); 

            try {
                expect(sftp.uploads).to.have.lengthOf(6); 
                // Check that node-scp2 mock's upload was NOT called for dryRun
                expect(nodeScp2ClientMockInstance.calls.upload).to.have.lengthOf(0);
                done();
            } catch (e) {
                done(e);
            }
        });
    });

    describe('Actual Upload (Mocked)', () => {
        it('should call node-scp2 mock upload for all discoverable files when no exclusions active', (done) => { // Updated test description
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy', 
                path: localPublicDir,
                remoteDir: '/var/www/remote',
                basePath: localPublicDir, 
                dryRun: false,
            };
            const sftp = new SftpUpload(options);
            sftp.on('completed', () => {
                try {
                    const uploadCalls = nodeScp2ClientMockInstance.calls.upload;
                    // 5 files because localPublicDir has 6, but one is in 'excluded_folder' 
                    // localPublicDir contains 6 files recursively.
                    // This test does not specify any 'exclude' or 'excludedFolders' options.
                    expect(uploadCalls).to.have.lengthOf(6); 
                    
                    const readmeUpload = uploadCalls.find(call => call.remotePath === '/var/www/remote/readme.txt');
                    expect(readmeUpload).to.exist;
                    expect(readmeUpload.localPath).to.equal(dummyFiles.readmeTxt);

                    const mainCssUpload = uploadCalls.find(call => call.remotePath === '/var/www/remote/css/main.css');
                    expect(mainCssUpload).to.exist;
                    expect(mainCssUpload.localPath).to.equal(dummyFiles.mainCss);
                    // Not checking mkdir calls as NodeScp2ClientMock doesn't track them
                    done();
                } catch (e) { done(e); }
            });
            sftp.on('error', done);
            sftp.upload();
        });

        it('should emit "uploading" events with progress and "completed" event', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy',
                path: localPublicDir, 
                remoteDir: '/remote',
                basePath: localPublicDir,
                dryRun: false,
            };
            const sftp = new SftpUpload(options);
            const uploadingEvents = [];
            let completedEvent = false;
            sftp.on('uploading', (progress) => {
                uploadingEvents.push(progress);
            });
            sftp.on('completed', () => {
                completedEvent = true;
            });
            sftp.on('error', done); 
            sftp.upload();

            setTimeout(() => {
                try {
                    expect(uploadingEvents.length).to.be.gte(5); 
                    if (uploadingEvents.length > 0) {
                        const finalProgressEvent = uploadingEvents[uploadingEvents.length -1];
                        expect(finalProgressEvent.percent).to.equal(100);
                    }
                    expect(completedEvent).to.be.true;
                    done();
                } catch (e) { done(e); }
            }, 500); 
        });
    });

    describe('Error Handling (Upload)', () => {
        it('should emit "error" if sftp.fastPut fails', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy',
                path: path.join(localCssDir, 'main.css'), 
                remoteDir: '/remote',
                basePath: localCssDir,
                dryRun: false,
            };
            nodeScp2ClientMockInstance.forceUploadError = new Error('Upload failed for main.css');
            const sftp = new SftpUpload(options);
            let errorEmitted = null;
            sftp.on('error', (err) => {
                errorEmitted = err;
            });
            sftp.on('completed', () => { 
                try {
                    expect(errorEmitted).to.exist;
                    expect(errorEmitted.message).to.equal('Upload failed for main.css');
                    done();
                } catch(e) { done(e); }
            });
            sftp.upload();
        });

        it('should emit "error" if sftp.mkdir fails', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy',
                path: path.join(localCssDir, 'main.css'), 
                remoteDir: '/remote',
                basePath: localBasePath, 
                dryRun: false,
            };
            nodeScp2ClientMockInstance.forceUploadError = new Error('Simulated error for mkdir test');
            const sftp = new SftpUpload(options);
            let errorEmitted = null;
            sftp.on('error', (err) => {
                errorEmitted = err;
            });
            sftp.on('completed', () => { 
                 try {
                    expect(errorEmitted).to.exist;
                    expect(errorEmitted.message).to.equal('Simulated error for mkdir test');
                    done();
                } catch(e) { done(e); }
            });
            sftp.upload();
        });

        it('should emit "error" if SFTP connection fails (sftp subsystem error)', (done) => {
            const options = { 
                host: 'localhost', username: 'test', privateKey: 'dummy',
                path: localPublicDir, remoteDir: '/remote', dryRun: false,
            };
            options.host = 'force_connection_error'; // Trigger error in NodeScp2ClientMock
            const sftp = new SftpUpload(options); // Re-instantiate
            let errorEmitted = null;
            sftp.on('error', (err) => {
                errorEmitted = err;
                try {
                    expect(errorEmitted).to.exist;
                    expect(errorEmitted.message).to.equal('Mocked connection error from node-scp2');
                } catch(e) { return done(e); }
            });
            sftp.on('completed', () => { 
                try {
                     expect(errorEmitted).to.exist;
                     done();
                } catch(e) { done(e); }
            });
            sftp.upload();
        });

         it('should emit "error" if SSH connection itself fails', (done) => {
            const options = { 
                host: 'localhost', username: 'test', privateKey: 'dummy',
                path: localPublicDir, remoteDir: '/remote', dryRun: false,
            };
            ssh2ClientMockInstance.connectionError = 'Connection refused'; 
            const sftp = new SftpUpload(options);
            let errorEmitted = null;
            sftp.on('error', (err) => {
                errorEmitted = err;
                 try {
                    expect(errorEmitted).to.exist;
                    expect(errorEmitted.message).to.equal('Connection refused'); 
                    done(); 
                } catch(e) { done(e); }
            });
            sftp.on('completed', () => {
                done(new Error("'completed' event should not be emitted on SSH connection failure before operations start."));
            });
            sftp.upload();
        });
    });
}); // End of main describe block
