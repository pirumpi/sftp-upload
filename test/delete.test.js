// test/delete.test.js
const proxyquire = require('proxyquire');
const { expect } = require('chai');
const path = require('path'); // Not strictly needed for delete tests if not creating local files
const { SSH2ClientMock } = require('./mocks/ssh2-client-mock');

// Path to the module under test
const sftpUploadModulePath = '../lib/sftp-upload.js';

describe('SftpUpload - Delete Functionality', () => {
    let SftpUpload;
    let ssh2ClientMockInstance;

    beforeEach(() => {
        // ssh2ClientMockInstance = new SSH2ClientMock(); // Not using the full mock

        const loggingSsh2ClientMock = function(config) {
            console.log('!!! loggingSsh2ClientMock CONSTRUCTOR CALLED with config:', config);
            this.connect = (cfg) => { 
                console.log('!!! loggingSsh2ClientMock INSTANCE .connect() CALLED');
                this.emit('ready'); 
            };
            this.sftp = (callback) => {
                console.log('!!! loggingSsh2ClientMock INSTANCE .sftp() CALLED');
                const minimalSftpMock = {
                    end: () => console.log('!!! minimalSftpMock .end() CALLED'),
                    unlink: (a,cb) => { console.log('!!! minimalSftpMock .unlink() CALLED'); cb(); },
                    // fastPut and mkdir not strictly needed for delete tests but included for broader compatibility
                    fastPut: (a,b,c,cb) => { console.log('!!! minimalSftpMock .fastPut() CALLED'); cb(); },
                    mkdir: (a,b,cb) => { 
                        console.log('!!! minimalSftpMock .mkdir() CALLED'); 
                        if(typeof b === 'function') b(); 
                        else if (typeof cb === 'function') cb(); 
                        else console.log('!!! minimalSftpMock .mkdir() callback issue');
                    }
                };
                callback(null, minimalSftpMock);
            };
            this.end = () => { console.log('!!! loggingSsh2ClientMock INSTANCE .end() CALLED'); this.emit('close'); };
            
            Object.assign(this, require('events').EventEmitter.prototype);
            require('events').EventEmitter.call(this);

            if (!this.on) { 
                this.on = (event, handler) => { console.log(`!!! loggingSsh2ClientMock INSTANCE .on('${event}') CALLED`); };
            }
        };
        Object.setPrototypeOf(loggingSsh2ClientMock.prototype, require('events').EventEmitter.prototype);

        SftpUpload = proxyquire.noCallThru().noPreserveCache().load(sftpUploadModulePath, {
            'ssh2': {
                Client: loggingSsh2ClientMock
            }
        });
    });

    afterEach(() => {
        ssh2ClientMockInstance.resetAll();
    });

    describe('File Processing & Dry Run (Delete)', () => {
        it('should correctly process removeFiles list in dryRun mode', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy_key',
                path: 'dummy/path', // Required by sftp-upload constructor
                remoteDir: '/var/www/data',
                removeFiles: ['file1.txt', 'sub/file2.log', 'another.dat'],
                dryRun: true,
            };
            const sftp = new SftpUpload(options);
            const deletedEvents = [];
            let completedEvent = false;

            sftp.on('filedeleted', (filePath) => {
                deletedEvents.push(filePath);
            });
            sftp.on('deletecompleted', () => {
                completedEvent = true;
            });
             sftp.on('error', done); // Fail test on any error

            sftp.deleteFiles(); // Call the method under test

            // In dryRun for deleteFiles, events are emitted fairly synchronously from the main loop
            // as it doesn't wait for actual async SFTP ops.
            // The dryRun for deleteFiles was modified to bypass connection.
            try {
                expect(deletedEvents).to.have.lengthOf(3);
                expect(deletedEvents).to.include.members([
                    '/var/www/data/file1.txt',
                    '/var/www/data/sub/file2.log',
                    '/var/www/data/another.dat'
                ]);
                expect(ssh2ClientMockInstance.sftpMockInstance.calls.unlink).to.have.lengthOf(0, "sftp.unlink should not be called in dryRun");
                expect(completedEvent).to.be.true;
                done();
            } catch (e) {
                done(e);
            }
        });

        it('should do nothing in dryRun if removeFiles is empty', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy_key',
                path: 'dummy/path', remoteDir: '/var/www/data',
                removeFiles: [],
                dryRun: true,
            };
            const sftp = new SftpUpload(options);
            let fileDeletedCalled = false;
            sftp.on('filedeleted', () => fileDeletedCalled = true);
            sftp.on('deletecompleted', () => {
                try {
                    expect(fileDeletedCalled).to.be.false;
                    expect(ssh2ClientMockInstance.sftpMockInstance.calls.unlink).to.have.lengthOf(0);
                    done();
                } catch (e) { done(e); }
            });
            sftp.deleteFiles();
        });
    });

    describe('Actual Deletion (Mocked)', () => {
        it('should call sftp.unlink for each file in removeFiles list', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy_key',
                path: 'dummy/path', remoteDir: '/var/www/data',
                removeFiles: ['file1.txt', 'sub/file2.log'],
                dryRun: false,
            };
            const sftp = new SftpUpload(options);
            const deletedEvents = [];
            let completedEvent = false;

            sftp.on('filedeleted', (filePath) => deletedEvents.push(filePath));
            sftp.on('deletecompleted', () => completedEvent = true);
            sftp.on('error', done);


            sftp.deleteFiles();
            
            // Wait for async operations to complete via events or timeout
            setTimeout(() => {
                try {
                    const unlinkCalls = ssh2ClientMockInstance.sftpMockInstance.calls.unlink;
                    expect(unlinkCalls).to.have.lengthOf(2);
                    expect(unlinkCalls.map(c => c.path)).to.include.members([
                        '/var/www/data/file1.txt',
                        '/var/www/data/sub/file2.log'
                    ]);
                    expect(deletedEvents).to.have.lengthOf(2);
                    expect(completedEvent).to.be.true;
                    done();
                } catch (e) {
                    done(e);
                }
            }, 100); // Small delay for mock async operations
        });

        it('should emit "filedeleted" and "deletecompleted" events correctly', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy_key',
                path: 'dummy/path', remoteDir: '/remote',
                removeFiles: ['todelete.txt'],
                dryRun: false,
            };
            const sftp = new SftpUpload(options);
            let fileDeletedPath = null;
            let deleteCompleted = false;

            sftp.on('filedeleted', (path) => fileDeletedPath = path);
            sftp.on('deletecompleted', () => deleteCompleted = true);
            sftp.on('error', done);

            sftp.deleteFiles();

            setTimeout(() => {
                try {
                    expect(fileDeletedPath).to.equal('/remote/todelete.txt');
                    expect(deleteCompleted).to.be.true;
                    done();
                } catch (e) { done(e); }
            }, 100);
        });
    });

    describe('Error Handling (Delete)', () => {
        it('should emit "error" if sftp.unlink fails for a file, but continue processing others', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy_key',
                path: 'dummy/path', remoteDir: '/var/www/data',
                removeFiles: ['exists.txt', 'no_such_file.txt', 'another_exists.txt'],
                dryRun: false,
            };

            // Configure mock to fail for a specific file
            const sftpMock = ssh2ClientMockInstance.sftpMockInstance;
            const originalUnlink = sftpMock.unlink.bind(sftpMock);
            sftpMock.unlink = (filePath, callback) => {
                sftpMock.calls.unlink.push({ path: filePath }); // Ensure call is logged
                if (filePath.includes('no_such_file.txt')) {
                    callback(new Error('SFTP_ERROR: No such file'));
                } else {
                    callback(null);
                }
            };

            const sftp = new SftpUpload(options);
            const errors = [];
            const deletedFiles = [];
            let deleteCompleted = false;

            sftp.on('error', (errInfo) => errors.push(errInfo));
            sftp.on('filedeleted', (filePath) => deletedFiles.push(filePath));
            sftp.on('deletecompleted', () => deleteCompleted = true);
            
            sftp.deleteFiles();

            setTimeout(() => {
                try {
                    expect(errors).to.have.lengthOf(1);
                    expect(errors[0].file).to.equal('/var/www/data/no_such_file.txt');
                    expect(errors[0].error.message).to.equal('SFTP_ERROR: No such file');
                    
                    expect(deletedFiles).to.have.lengthOf(2);
                    expect(deletedFiles).to.include.members(['/var/www/data/exists.txt', '/var/www/data/another_exists.txt']);
                    
                    expect(deleteCompleted).to.be.true;
                    done();
                } catch (e) {
                    done(e);
                } finally {
                    // Restore original mock method if necessary, though for this test structure it's fine
                }
            }, 100);
        });

        it('should emit "error" if SFTP connection fails (sftp subsystem error during delete)', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy_key',
                path: 'dummy/path', remoteDir: '/var/www/data',
                removeFiles: ['file1.txt'],
                dryRun: false,
            };
            ssh2ClientMockInstance.sftpError = 'SFTP subsystem failure during delete';
            const sftp = new SftpUpload(options);
            let errorEmitted = null;
            let deleteCompletedCalled = false;

            sftp.on('error', (err) => errorEmitted = err);
            sftp.on('deletecompleted', () => deleteCompletedCalled = true); // sftp-upload emits this even on general error

            sftp.deleteFiles();
            
            setTimeout(() => {
                try {
                    expect(errorEmitted).to.exist;
                    expect(errorEmitted.general).to.equal('SFTP subsystem error');
                    expect(errorEmitted.error.message).to.equal('SFTP subsystem failure during delete');
                    expect(deleteCompletedCalled).to.be.true;
                    done();
                } catch(e) { done(e); }
            }, 50);
        });

        it('should emit "error" if SSH connection itself fails during delete', (done) => {
            const options = {
                host: 'localhost', username: 'test', privateKey: 'dummy_key',
                path: 'dummy/path', remoteDir: '/var/www/data',
                removeFiles: ['file1.txt'],
                dryRun: false,
            };
            ssh2ClientMockInstance.connectionError = 'Connection refused during delete';
            const sftp = new SftpUpload(options);
            let errorEmitted = null;
            let deleteCompletedCalled = false;
            
            sftp.on('error', (err) => errorEmitted = err);
            sftp.on('deletecompleted', () => deleteCompletedCalled = true);


            sftp.deleteFiles();
            
            setTimeout(() => {
                try {
                    expect(errorEmitted).to.exist;
                    expect(errorEmitted.general).to.equal('Connection error');
                    expect(errorEmitted.error.message).to.equal('Connection refused during delete');
                    // For deleteFiles, if connection fails, 'deletecompleted' is still emitted due to current structure
                    expect(deleteCompletedCalled).to.be.true; 
                    done();
                } catch(e) { done(e); }
            }, 50);
        });
    });
});
