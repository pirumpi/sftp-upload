# [SFTP-UPLOAD](https://npmjs.org/package/sftp-upload)

sftp-upload allows node to upload the content of a folder to a remote server utilizing sftp protocol. The idea behind this modules is to simplify the ssh2 interface for sftp. This module has not OS dependencies so it can be run from Windows, Mac, and Linux.

## Getting Started
This module depends on: `ssh2`  and `scp2`
```bash
	npm install sftp-upload
```

You must configure the sftp before attempting to upload files. The following parameters are required in the sftp.config object.

- **host:** Remote server IP/Hostname.
- **port:** sftp port, 22 by default.
- **username:** sftp server's username.
- **path:** Path to a directory or a file that is going to be uploaded to the server. String or Array.
- **basePath:** Optional. E.g. in case if you have `path: ['./public/css','./public/js']` but want to move them directly to a `remoteDir` without creating `public` directory, you may also set `basePath: './public'` to ignore this part of the path. If your `path` is a string path to a directory, it's set as a `basePath` by default.
- **remoteDir:** Remote directory where files are going to be uploaded.
- **excludedFolders:** Array of directory names that won't be uploaded. (Can include simple glob pattern)
- **exclude:** Array of specific relative file names that won't be uploaded.
- **privateKey:** RSA key, you must upload a public key to the remote server before attempting to upload any content.
- **passphrase:** RSA key passphrase. (Optional, should be stored in external file)
- **password:** When using username password only authentication (Optional)
- **removeFiles:** Optional. An array of file paths relative to `remoteDir` that should be deleted from the SFTP server. Example: `['old_file.txt', 'logs/jan.log']`. Used by the `deleteFiles()` method.
- **dryRun:** Just list files to be uploaded, don't actually send anything to the server. Also applies to `deleteFiles()`.

### Example
```js
    var SftpUpload = require('sftp-upload'),
        fs = require('fs');

    var options = {
        host:'localhost',
        username:'root',
        path: '/',
        remoteDir: '/tempDir',
        excludedFolders: ['**/.git', 'node_modules'],
        exclude: ['.gitignore', '.vscode/tasks.json'],
        privateKey: fs.readFileSync('privateKey_rsa'),
        passphrase: fs.readFileSync('privateKey_rsa.passphrase'),
        dryRun: false,
    },
    sftp = new SftpUpload(options);

    sftp.on('error', function(err) {
        throw err;
    })
    .on('uploading', function(progress) {
        console.log('Uploading', progress.file);
        console.log(progress.percent+'% completed');
    })
    .on('completed', function() {
        console.log('Upload Completed');
    })
    .upload();
```

### Events

- connect
- uploading ({file: currentFile, percent: percentage completed})
- error (err)
- completed

### deleteFiles() Method

The `deleteFiles()` method attempts to delete files specified in the `removeFiles` option from the SFTP server.

```javascript
// Assuming 'sftp' is an instance of SftpUpload configured with 'removeFiles'
sftp.deleteFiles();
```

This method will:
- Read the list of files from the `removeFiles` array in the instance's configuration.
- Attempt to delete each file from the `remoteDir` on the SFTP server.
- Respect the `dryRun` option (if `true`, it will log files to be deleted without actually deleting them).

**Events related to `deleteFiles()`:**

- `error`: Emitted if an error occurs during the deletion of a specific file (e.g., file not found, permissions issue). The error object will contain details about the file and the error. The process does not stop on such errors.
- `filedeleted`: Emitted after a file has been successfully deleted (or would be deleted in `dryRun` mode). The event passes the full remote path of the file.
- `deletecompleted`: Emitted after all files in the `removeFiles` list have been processed.

## License

(The BSD License)

Copyright (c) 2014 Carlos Martin &lt;pirumpi@gmail.comt&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
