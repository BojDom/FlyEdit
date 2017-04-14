"use strict"
const upath = require('upath');
const path = require('path');
const scp = require('scp2');
const _ = require('lodash');
const watch = require('node-watch');
var Promise = require('bluebird');
const fs = require('fs')
const rx = require('rxjs');
const multimatch = require('multimatch');
var excludeDirs = ["**", '!**/node_modules/**', '!node_modules', "!.git", "!dist"];


var excludeFiles = [];


const mkdirp = require('mkdirp');
var sshClient = require('ssh2').Client;
var scpClient = require('scp2').Client;
var FEconfig = require('./FlyEdit-config.js');
var remoteDir = {}
var watcher;
var sftp = {};
var files = [];
var sshConn = new sshClient();
var scpConn = new scpClient();

var remoteReadSubject = new rx.Subject();
var remoteDwnlSubject = new rx.Subject();

scpConn.defaults(FEconfig.server)


fs.readdir(FEconfig.localRoot, (err, ok) => {
	if (err) fs.mkdir(FEconfig.localRoot, (err2, ok2) => {
		if (err2) console.log('error creating local folder', FEconfig.localRoot)
	})
})

var remoteReadSubscription = remoteReadSubject.debounceTime(1000).subscribe(x => {
	if (files.length > 0) {
		console.log('files in queue', files.length)
		downloadFiles()
	} else {
		console.log('No file to download');
		process.exit(0);
	}
});

sshConn.on('ready', function() {

	sshConn.sftp(function(err, sftpObj) {
		if (err) throw (err);
		console.log('Client :: ready');


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
		}

		getDirectory('/')
	})

}).connect(FEconfig.server);



function getDirectory(dir, from) {

	if (typeof from != 'string') from = FEconfig.server.root;

	let dirr = upath.join(from, dir);

	sftp.readdir(dirr).then(list => {
		let filepath = dirr.replace(FEconfig.server.root, '');


		let ff = list.filter(f => {
			if (f.attrs.mode == 33188 && f.attrs.size < FEconfig.maxFileSize)
				return true;
		}).map(f => {
			files.push(upath.join(filepath, f.filename))
			return f.filename;
		})

		let dirs = list.filter(f => {
			if (f.attrs.mode != 16877) return false;
			return true;
		}).map(d => {
			return d.filename
		})

		dirs = multimatch(dirs, excludeDirs)
			/*
					console.log(dirs);
					process.exit();*/
		dirs.map(d => {
			getDirectory(d, dirr)
		})

		let relative = (filepath).split('/').join('.');
		if (relative.length == 2) relative = '/';


		let content = ff.concat(dirs);

		_.set(remoteDir, relative, content);
		remoteReadSubject.next()

	}).catch(err => {
		console.log('error retrieving root folder ', err)
	})
}

function downloadFiles() {
	var n = 0;
	downloadFile(files[n]);
	var remoteDwnlSubscription = remoteDwnlSubject.subscribe(() => {
		n++;
		if (n < files.length) downloadFile(files[n], `${n} of ${files.length}`);
		else {
			console.log('DOWNLOAD COMPLETE!', n);
			watchProject()
		}
	})
}

function downloadFile(f, pct) {


	let localPath = f.substring(0, f.lastIndexOf("/"));
	let filename = f.replace(localPath, '');

	localPath = path.join(FEconfig.localRoot, localPath);

	if (localPath.length > 0 && !fs.existsSync(localPath))
		mkdirp(localPath, (err, ok) => {
			if (err) {
				console.log('error creating local folder', localPath);
				process.exit(1);
			}
			actualDownload()
		})
	else actualDownload()

	function actualDownload() {
		scpConn.download(
			upath.join(FEconfig.server.root, f),
			path.join(FEconfig.localRoot, f),
			(err, ok) => {
				if (err) {
					console.log('error downloading', upath.join(FEconfig.server.root, f), err);
					process.exit(1)

				} else {
					console.log('downloaded', f, pct);
					remoteDwnlSubject.next()
				}
			})
	}
}

function watchProject() {

	let watchOptions = {
		recursive: true,
		filter: (name) => {
			return (multimatch(upath.join(name), excludeDirs).length > 0)
		}
	}

	watcher = watch(FEconfig.localRoot, watchOptions, function(evt, name) {
		name = name.replace(FEconfig.localRoot, '');
		console.log(upath.join(name))
		console.log('changed ', name, multimatch(upath.join(name), excludeDirs))

		upload(name)
	});
}

function upload(f) {

	let from = path.join(FEconfig.localRoot, f);
	let to = upath.join(FEconfig.server.root, f)

	scpConn.upload(from, to, (err, ok) => {
		if (err) {
			console.log('error uploading', upath.join(FEconfig.server.root, f), err);
			process.exit(1);
		} else {
			console.log('uploaded', f);
		}
	})
}

process.on('SIGINT', () => {
	sshConn.end();
	scpConn.close();
	if (watcher) watcher.close();
	console.log('connection closed');
	setTimeout(() => {
		process.exit(0);
	}, 2000)
});