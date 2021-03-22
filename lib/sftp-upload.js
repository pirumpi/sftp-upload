var fs = require('fs'),
    path = require('path'),
    Client = require('node-scp2').Client,
    async = require('async'),
    events = require('events'),
    util = require('util'),
    extend = require('node.extend');


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

            var excludedFolderFound = self.defaults.excludedFolders.find((folder) => {
                if (folder.match(/^\*\*[\\/]/)) {
                    const _folder = folder.substr(3);
                    return workingFolder.includes(_folder);
                }
                return path.resolve(process.cwd(), folder) === workingFolder;
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
        client = new Client(opt),
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

SftpUpload.prototype.shouldUpload = function (currentFile) {
    return !this.defaults.exclude.some(excl => {
        return path.join(process.cwd(), excl) === currentFile;
    });
}

module.exports = SftpUpload;
