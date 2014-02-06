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
    
    events.EventEmitter.call(this);
    
    var self = this;
    this.defaults = extend(defaultOptions, options);
       if(!fs.existsSync(self.defaults.path)){
           var e = new Error(self.defaults.path+' does not exist');
        self.emit('error', e);
    }
    
    return this;
};

util.inherits(SftpUpload, events.EventEmitter);

SftpUpload.prototype.addFiles = function(files, baseDir, uploads){
    var self = this;
    files.forEach(function(file){
        var currentFile = path.resolve(baseDir, file),
            stats = fs.statSync(currentFile);
        
        if(stats.isFile()){ uploads.push(currentFile); }
        
        if(stats.isDirectory()){
            var workingFolder = path.resolve(baseDir, currentFile);
            self.addFiles(fs.readdirSync(workingFolder), workingFolder, uploads);
        }
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
    
    files.forEach(function(file){
        fns.push(
            function(cb){
                var localFile = path.relative(opt.path, file),
                    remoteFile = path.join(opt.remoteDir, localFile);
                client.upload(file, '.'+remoteFile, function(err){
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
        files = fs.readdirSync(opt.path);
    this.addFiles(files, opt.path, self.uploads);
    this.uploadFiles(self.uploads, opt);
    return this;
};

module.exports = SftpUpload;