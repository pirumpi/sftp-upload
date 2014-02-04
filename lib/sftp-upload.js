var fs = require('fs'),
    path = require('path'),
    Client = require('scp2').Client,
    async = require('async'),
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    extend = require('node.extend');


var sftpUpload = new EventEmitter();

sftpUpload.defaults = {
        port: 22,
        username: '',
        host: '',
        privateKey: '',
        path: '/',
        remoteDir: '/sftpUpload-tmp-01'
};
    
sftpUpload.uploads = [];

sftpUpload.config = function(options){
    var self = this;
    self.defaults = extend(this.defaults, options);
       if(!fs.existsSync(self.defaults.path)){
           var e = new Error(self.defaults.path+' does not exist');
        sftpUpload.emit('error', e);
    }
    
    return this;
};

sftpUpload.upload = function(){
    var self = this,
        opt = self.defaults,
        files = fs.readdirSync(opt.path);
    addFiles(files, opt.path, self.uploads);
    uploadFiles(self.uploads, opt);
    return this;
};

function addFiles(files, baseDir, uploads){
    files.forEach(function(file){
        var currentFile = path.resolve(baseDir, file),
            stats = fs.statSync(currentFile);
        
        if(stats.isFile()){ uploads.push(currentFile); }
        
        if(stats.isDirectory()){
            var workingFolder = path.resolve(baseDir, currentFile);
            addFiles(fs.readdirSync(workingFolder), workingFolder, uploads);
        }
    });
}

function uploadFiles(files, opt){
    var fns = [],
        client = new Client(opt),
        totalFiles = files.length,
        pendingFiles = 0;
    
    client.on('connect', function(){
        sftpUpload.emit('connect');
    });
    
    files.forEach(function(file){
        fns.push(
            function(cb){
                var localFile = path.relative(opt.path, file),
                    remoteFile = path.join(opt.remoteDir, localFile);
                client.upload(file, '.'+remoteFile, function(err){
                    pendingFiles += 1;
                    sftpUpload.emit('uploading', {
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
            sftpUpload.emit('error', err);
        }
        sftpUpload.emit('completed');
        client.close();
    });
}

module.exports = sftpUpload;