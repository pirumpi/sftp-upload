var fs = require('fs'),
    path = require('path'),
    Client = require('scp2').Client,
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
        remoteDir: '/sftpUpload-tmp-01'
    }

    this.uploads = [];
    this.currentFile;

    events.EventEmitter.call(this);

    var self = this;
    this.defaults = extend(defaultOptions, options);
       if(!fs.existsSync(self.defaults.path)){
           var e = new Error(self.defaults.path+' does not exist');
        self.emit('error', e);
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

        if(stats.isFile()){ uploads.push(currentFile); }

        if(stats.isDirectory()){
            var workingFolder = path.resolve(baseDir, currentFile);
            self.addDirectory(fs.readdirSync(workingFolder), workingFolder, uploads);
        }
    });
}

SftpUpload.prototype.addFiles = function(files, baseDir, uploads){
    var self = this;
    files.forEach(function(file){
        var currentFile = path.resolve(baseDir, file),
            stats = fs.statSync(currentFile);
        if(stats.isFile()){ uploads.push(currentFile); }
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
        fns.push(
            function(cb){
                var localFile = path.relative(opt.path, file),
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
        isDirectory = false,
        isFile = false,
        files;
    if (opt.path && !opt.files) {
      isDirectory = true;
      files = fs.readdirSync(opt.path);
    }
    if (opt.files) {
      isFile = true;
      files = opt.files;
    }
    if (isDirectory) {
      this.addDirectory(files, opt.path, self.uploads);
    } else {
      this.addFiles(files, opt.path, self.uploads);
    }

    this.uploadFiles(self.uploads, opt);
    return this;
};

module.exports = SftpUpload;
