const upath = require('upath');
const path = require('path');
const scp = require('scp2');
const _ = require('lodash');
const watch = require('watch');
const mkdirp = require('mkdirp');
const fs = require('fs');
const glob = require("glob");
const rx = require('rxjs');
const multimatch = require('multimatch');
const moment = require('moment');
const rm = require('rimraf');
const sshClient = require('ssh2').Client;
const scpClient = require('scp2').Client;
const green = "\x1b[32m%s\x1b[0m";
var Promise = require('bluebird');
var watcher;
var serverTimeDelay = 0;
var sftp = {};
var files = [];
var toUpload = [];
var sshConn = new sshClient();
var scpConn = new scpClient();
var remoteDwnlSubject = new rx.Subject();


var argv = require('minimist')(process.argv.slice(2));
if (argv.p) project = argv.p;
else process.exit(1);

function is(type, mode) {
    if (typeof mode == 'number') mode = mode.toString();
    return (type == 'file') ? (mode.toString().substr(0, 2) == '33') : (mode.toString().substr(0, 3) == '168');
}



//scegliere il progetto lanciato dal comando
// lanciare in pm2 
var FEconfig = require('./FlyEdit-config')[argv.p];

var defaultExcludeDirs = ["**", '!**/node_modules/**', '!node_modules', "!.git", "!dist"];
var defaultExcludeFiles = ["**", "!.DS_Store"];

var excludeDirs = (FEconfig.excludeDirs) ? defaultExcludeDirs.concat(FEconfig.excludeDirs) : defaultExcludeDirs;
var excludeFiles = (FEconfig.excludeFiles) ? defaultExcludeFiles.concat(FEconfig.excludeFiles) : defaultExcludeFiles;
var localFiles = {};
var localFilesNames = [];
scpConn.defaults(FEconfig.server);

glob.sync(FEconfig.localRoot + '/**', {
    stat: true,
    nodir: true,
    dot: true,
}).map(f => {
    let rel = f.replace(upath.normalize(FEconfig.localRoot), '');
    let statFile = fs.statSync(f);
    localFiles[rel] = moment(statFile.mtime).unix();
});
if (typeof localFiles === 'object') localFilesNames = Object.keys(localFiles);
/*console.log(localFiles);
process.exit();
*/

sshConn.on('error', function(hadError) {
    console.log('err1', hadError);
    if (hadError) {
        console.log('error1');
        sshConn.connect(FEconfig.server);
    }
});

sshConn.on('close', function(hadError) {
    console.log('err2', hadError);
    if (hadError) {
        console.log('error2');
        sshConn.connect(FEconfig.server);
    }
});


// gestire disconnesione e connettere manualmente
sshConn.on('ready', function() {

    var keepAlive = setInterval(() => {

        sshConn.exec('date -R', function(err, stream) {
            if (err) throw err;
            stream.on('close', function(code, signal) {
                //console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
                //conn.end();
            }).on('data', function(data) {
                if (data) {
                    let format = "ddd, MM MMM YYYY HH:mm:ss [GMT]";
                    let now = moment().format(format);
                    let serverDate = moment.utc(data.toString()).format(format);

                    console.log('diff', now, serverDate);
                }
            }).stderr.on('data', function(data) {
                console.log('STDERR: ' + data);
            });
        });

    }, 120000);


    sshConn.sftp(function(err, sftpObj) {
        if (err) throw (err);
        console.log('Client :: ready');
        //re
        if (files.length == 0)
            sftp.readdir = function(dir) {
                return new Promise(function(resolve, reject) {
                    sftpObj.readdir(dir, function(err, list) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(list);
                        }
                    });
                });
            };
        else watchProject();

        getDirectory('/');
    });

});

sshConn.connect(FEconfig.server);

function getDirectory(dir, from) {

    if (typeof from != 'string') from = FEconfig.server.root;

    let dirr = upath.join(from, dir);
    return new Promise((resolve, reject) => {
        sftp.readdir(dirr).then(list => {


            let filepath = dirr.replace(FEconfig.server.root, '');
            let ff = [];
            let dirs = [];
            list.map(f => {

                /*				if (/render/.test(f.filename)) {
                						console.log(f.attrs.mtime,localFiles);
                						process.exit(1)
                				}*/

                if (is('file', f.attrs.mode) && f.attrs.size < FEconfig.maxFileSize) {
                    f.filename = upath.join(filepath, f.filename);

                    if (localFilesNames.indexOf(f.filename) > -1) {
                        console.log(f.filename, localFiles[f.filename], f.attrs.mtime);
                        if (localFiles[f.filename] <= f.attrs.mtime)
                            ff.push(f.filename);
                        else {
                            toUpload.push(f.filename);
                        }
                    } else ff.push(f.filename);
                } else if (is('dir', f.attrs.mode))
                    dirs.push(f.filename);
            });


            ff = multimatch(ff, excludeFiles);
            ff.map(f => {
                files.push(f);
            });

            dirs = multimatch(dirs, excludeDirs);
            dirs.map(d => {
                queue++;
                getDirectory(d, dirr);
            });

            queued++;

            if (queued == queue) {
                if (files.length > 0) {
                    console.log('files in queue', files);
                    //process.exit();
                    downloadFiles();
                } else {
                    console.log('No file to download');
                    watchProject();
                    //process.exit(0);
                }
                console.log('files to upload', toUpload.length);
                if (toUpload.length > 0) uploadFiles();
            }

        }).catch(err => {
            console.log('error retrieving root folder ', err, dir, from);
        });
    });
}

function downloadFiles(n) {

    n = (!n) ? 0 : n;
    downloadFile(files[n]).then((err, ok) => {
        n++;
        if (n < files.length)
            downloadFiles(n);
        else {
            console.log('DOWNLOAD COMPLETE!', n);
            watchProject();
        }
    });

}

function uploadFiles(n) {

    n = (!n) ? 0 : n;
    console.log('upload n ',n);
    upload(toUpload[n]).then(() => {
        n++;
		if (n < toUpload.length)
            uploadFiles(n);
        else {
            console.log('Uploads COMPLETE!', n);
        }
    });

}

var queue = 1;
var queued = 0;

function downloadFile(f, pct) {

	return new Promise((resolve,reject)=>{
	    let localPath = f.substring(0, f.lastIndexOf("/"));
	    let filename = f.replace(localPath, '');

	    localPath = path.join(FEconfig.localRoot, localPath);

	    if (localPath.length > 0 && !fs.existsSync(localPath))
	        mkdirp(localPath, (err, ok) => {
	            if (err) {
	                console.log('error creating local folder', localPath);
	                process.exit(1);
	            }
	            actualDownload();
	        });
	    else actualDownload();

	    function actualDownload() {
	        return scpConn.download(
	            upath.join(FEconfig.server.root, f),
	            path.join(FEconfig.localRoot, f),
	            (err,ok)=>{

		    		if (err) {
		    			console.warn('error downloading',f);
		    			reject();
		    		}
		    		else {
		    			console.log(green,'downloaded',green,f);
		    			resolve();
		    		}
    	
	            }
	        );
	    };
	});
}

function upload(relativePath) {

    let from = path.join(FEconfig.localRoot, relativePath);
    let to = upath.join(FEconfig.server.root, relativePath);

    return new Promise((resolve,reject)=>{
    	scpConn.upload(from, to,(err,ok)=>{
    		if (err) {
    			console.warn('error uploading',relativePath);
    			reject();
    		}
    		else {
    			console.log('uploaded',green,relativePath);
    			resolve();
    		}
    	});
    });
}

function watchProject() {

    console.log('Watching for changes in ', FEconfig.projectName);

    watcher = watch.createMonitor(FEconfig.localRoot, function(monitor) {

        monitor.on("created", function(f, stat) {
            console.log('new file', f, stat);
            if (is('file', stat.mode))
                upload(f.replace(FEconfig.localRoot, ''));
        });
        monitor.on("changed", function(f, curr, prev) {
            upload(f.replace(FEconfig.localRoot, ''));
        });
        monitor.on("removed", function(f, stat) {
            // Handle removed files
        });
        return monitor;
    });
}

process.on('SIGINT', () => {
    sshConn.end();
    scpConn.close();
    if (typeof watcher !== 'undefined') {
        console.log(watcher);
        watcher.stop();
    }
    console.log('connection closed - ', typeof watcher);
    watcher = undefined;

    //rm.sync(FEconfig.localRoot);
    setTimeout(() => {
        process.exit(0);
    }, 2000);
});