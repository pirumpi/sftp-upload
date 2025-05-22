var fs = require('fs'),
    path = require('path'),
    Client = require('node-scp2').Client, // Original line for node-scp2 client
    async = require('async'),
    events = require('events'),
    util = require('util'),
    extend = require('node.extend'),
    { Client: SSH2Client } = require('ssh2'); // For SftpUpload's direct ssh2 usage (deleteFiles)


function SftpUpload (options){

    var defaultOptions = {
        port: 22,
        username: '',
        host: '',
        privateKey: '',
        path: '/',
        basePath: './',
        remoteDir: '/sftpUpload-tmp-01',
        excludedFolders: [],
        exclude: [],
        dryRun: false,
        removeFiles: []
    }

    if(!options.path){
        throw new Error('Parameter "path" is required');
    }

    if (typeof options.passphrase === 'string') {
        options.password = options.passphrase
    }
    
    this.uploads = [];
    this.currentFile;

    events.EventEmitter.call(this);

    this.defaults = extend(defaultOptions, options);
    if(typeof this.defaults.path === 'string') {
        this.defaults.basePath = this.defaults.path;
    }

    return this;
};

SftpUpload.prototype.setCurrentFile = function(file) {
  this.currentFile = file;
}

SftpUpload.prototype.getCurrentFile = function(file) {
  return this.currentFile;
}

util.inherits(SftpUpload, events.EventEmitter);

SftpUpload.prototype.addDirectory = function(files, baseDir, uploads){
    var self = this;
    files.forEach(function(file){
        var currentFile = path.resolve(baseDir, file),
            stats = fs.statSync(currentFile);

        if(stats.isFile() && self.shouldUpload(currentFile)){ uploads.push(currentFile); }

        if(stats.isDirectory()){
            var workingFolder = path.resolve(baseDir, currentFile);

            var excludedFolderFound = self.defaults.excludedFolders.find((folderNameOrPattern) => {
                if (folderNameOrPattern.match(/^\*\*[\/]/)) {
                    const pattern = folderNameOrPattern.substring(3); // e.g., "node_modules" from "**/node_modules"
                    // Check if any directory name in the workingFolder path matches the pattern
                    return workingFolder.split(path.sep).includes(pattern);
                } else {
                    // Simple directory name match against the basename of the working folder
                    return path.basename(workingFolder) === folderNameOrPattern;
                }
            });

            if (excludedFolderFound === undefined) {
                self.addDirectory(fs.readdirSync(workingFolder), workingFolder, uploads);
            }
        }
    });
}

SftpUpload.prototype.addFiles = function(files, baseDir, uploads){
    var self = this;
    files.forEach(function(file){
        var currentFile = path.resolve(baseDir, file),
            stats = fs.statSync(currentFile);
        if(stats.isFile() && self.shouldUpload(currentFile)){ uploads.push(currentFile); }
    });
}

SftpUpload.prototype.uploadFiles = function(files, opt){
    var fns = [],
        client = new Client(opt), // Uses the Client from require('node-scp2').Client
        totalFiles = files.length,
        pendingFiles = 0,
        self = this;

    client.on('connect', function(){
        self.emit('connect');
    });

	client.on('error', function(err){
        self.emit('error',err);
    });

    client.on('transfer', function(buf, lastCursor, length) {
      self.emit('fileProgress', {
        file: path.basename(self.getCurrentFile()),
        percent: Math.round((lastCursor / length) * 100),
      });
    })

    files.forEach(function(file){
        if (self.defaults.dryRun) {
            console.log(file);
            return;
        }

        fns.push(
            function(cb){
                var localFile = path.relative(opt.basePath, file),
                    remoteFile = path.join(opt.remoteDir, localFile);
                    self.setCurrentFile(localFile);
                client.upload(file, remoteFile, function(err){
                    pendingFiles += 1;
                    self.emit('uploading', {
                        file: file,
                        percent: Math.round((pendingFiles*100)/totalFiles)
                    });
                    cb(err);
                });
            }
        );
    });

    async.series(fns, function(err, cb){
        if(err){
            self.emit('error', err);
        }
        self.emit('completed');
        client.close();
    });
}

SftpUpload.prototype.upload = function(){
    var self = this,
        opt = self.defaults,
        paths = typeof opt.path === 'string' ? [opt.path] : opt.path;

    paths.forEach(_path_ => {
        var currentFile = path.resolve(_path_);
        var fileExists = fs.existsSync(currentFile);
        if(fileExists){
            var stats = fs.statSync(currentFile);

            if(stats.isFile()){
                self.uploads.push(currentFile);
            } else {
                var files = fs.readdirSync(_path_);
                this.addDirectory(files, _path_, self.uploads);
            }
        } else {
            console.log(currentFile + ' - does not exist');
        }
    });

    this.uploadFiles(self.uploads, opt);
    
    return this;
};

SftpUpload.prototype.shouldUpload = function (currentFile) { // currentFile is absolute
    // Exclude patterns are relative to the basePath.
    // this.defaults.basePath is set to options.path if options.path is a string,
    // or to options.basePath if provided, otherwise defaults to './'.
    const basePath = this.defaults.basePath || process.cwd(); // Fallback to cwd if basePath is somehow undefined/empty, though defaultOptions sets it.

    return !this.defaults.exclude.some(excl => {
        const absoluteExclPath = path.resolve(basePath, excl);
        return absoluteExclPath === currentFile;
    });
}

SftpUpload.prototype.deleteFiles = function() {
    var self = this, // self is not used, this is used directly.
        opt = this.defaults;

    if (!opt.removeFiles || !opt.removeFiles.length) {
        this.emit('deletecompleted');
        return this;
    }

    const conn = new SSH2Client();
    const filesToDelete = opt.removeFiles.slice(); // Use a copy

    conn.on('ready', () => {
        conn.sftp((err, sftp) => {
            if (err) {
                this.emit('error', { general: 'SFTP subsystem error', error: err });
                this.emit('deletecompleted');
                conn.end();
                return;
            }

            async.eachSeries(filesToDelete, (filePath, callback) => {
                const fullRemotePath = path.join(opt.remoteDir, filePath);

                if (opt.dryRun) {
                    console.log('Dry run: Would delete ' + fullRemotePath);
                    this.emit('filedeleted', fullRemotePath); // Consider a more specific dry run event e.g., 'filedelete_dryrun'
                    callback();
                } else {
                    sftp.unlink(fullRemotePath, (deleteErr) => {
                        if (deleteErr) {
                            this.emit('error', { file: fullRemotePath, error: deleteErr });
                        } else {
                            this.emit('filedeleted', fullRemotePath);
                        }
                        callback(); // Call callback regardless of deleteErr to continue series
                    });
                }
            }, (err) => { // Final callback for async.eachSeries
                // err from eachSeries will be the first error encountered if any, but we're already emitting errors per file.
                // So, we just proceed to cleanup.
                this.emit('deletecompleted');
                sftp.end(); // Close SFTP session
                conn.end(); // Close SSH connection
            });
        });
    });

    conn.on('error', (err) => {
        this.emit('error', { general: 'Connection error', error: err });
        this.emit('deletecompleted'); // Ensure this is emitted even on connection error
        conn.end(); // Attempt to close connection if it was opened
    });

    const connectionParams = {
        host: opt.host,
        port: opt.port,
        username: opt.username,
        privateKey: opt.privateKey // Assuming it's the key content string
        // password: opt.password, // if available
        // passphrase: opt.passphrase // if private key is passphrase protected
    };

    if (opt.password) connectionParams.password = opt.password;
    if (opt.passphrase) connectionParams.passphrase = opt.passphrase;
    // Add agent forwarding if ssh-agent is available
    if (process.env.SSH_AUTH_SOCK) connectionParams.agent = process.env.SSH_AUTH_SOCK;

    if (opt.dryRun) {
        // In dryRun mode, we don't need to establish a real connection
        // We simulate the connection and sftp setup to test the dryRun logic for file "deletion"
        async.eachSeries(filesToDelete, (filePath, callback) => {
            const fullRemotePath = path.join(opt.remoteDir, filePath);
            console.log('Dry run: Would delete ' + fullRemotePath);
            this.emit('filedeleted', fullRemotePath);
            callback();
        }, (err) => {
            this.emit('deletecompleted');
        });
    } else {
        conn.connect(connectionParams);
    }

    return this; // To allow chaining
};

module.exports = SftpUpload;
