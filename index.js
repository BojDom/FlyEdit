const upath = require('upath');
const path = require('path');
const scp = require('scp2');
const _ = require('lodash');
const watch = require('node-watch');
const mkdirp = require('mkdirp');
const fs = require('fs');
const glob = require("glob");
const rx = require('rxjs');
const multimatch = require('multimatch');
const moment = require('moment');
const rm = require('rimraf');

var project='tubemp3'

var argv = require('minimist')(process.argv.slice(2));
if (argv.p) project=argv.p
var FEconfig = require('./FlyEdit-config.js')(project);


var Promise = require('bluebird');
var sshClient = require('ssh2').Client;
var scpClient = require('scp2').Client;
var watcher;
var sftp = {};
var files = [];
var sshConn = new sshClient();
var scpConn = new scpClient();
var remoteReadSubject = new rx.Subject();
var remoteDwnlSubject = new rx.Subject();

var excludeDirs = ["**", '!**/node_modules/**', '!node_modules', "!.git", "!dist"];
var excludeFiles = [];
var localFiles = {};
var localFilesNames=[];
scpConn.defaults(FEconfig.server);

glob.sync(FEconfig.localRoot + '/**',{stat:true,nodir:true}).map(f=>{
	let rel=f.replace(FEconfig.localRoot,'');
	let statFile = fs.statSync(f);	
	localFiles[rel]= moment( statFile.mtime).unix();
});
if (typeof localFiles==='object') localFilesNames=Object.keys(localFiles);
/*console.log(localFiles);
process.exit();*/


sshConn.on('error', function(hadError) {
	console.log('errrr',hadError)
	if (hadError){
		sshConn.connect(FEconfig.server);
	}
})

// gestire disconnesione e connettere manualmente
sshConn.on('ready', function() {

	sshConn.sftp(function(err, sftpObj) {
		if (err) throw (err);
		console.log('Client :: ready');
		//re
		if (files.length==0)
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
	return new Promise((resolve,reject)=>{
		sftp.readdir(dirr).then(list => {

			//console.log(list[0])
			//process.exit()

			let filepath = dirr.replace(FEconfig.server.root, '');

			let ff = list.filter(f => {
				console.log('t',localFiles[f.filename],(localFilesNames.indexOf(f.filename)<0));
				return (
						f.attrs.mode == 33188
						&& f.attrs.size < FEconfig.maxFileSize 
						&&
						(localFilesNames.indexOf(f.filename)<0) ||
						(localFiles[f.filename]<f.attrs.mtime)
					);
			}).map(f => {
				files.push(upath.join(filepath, f.filename));
				return f.filename;
			});
			//fs.appendFile('./a.json',JSON.stringify(ff),(err)=>{});
			//console.log(localFiles)
			//process.exit();

			let dirs = list.filter(f => {
				return (f.attrs.mode == 16877);
			}).map(d => {
				return d.filename;
			});
			dirs = multimatch(dirs, excludeDirs);
			dirs.map(d => {
				queue++;
				getDirectory(d, dirr);
			});

			/*let relative = (filepath).split('/').join('.');
			let content = ff.concat(dirs);*/
			queued++;

			if (queued == queue)
				if (files.length > 0) {
					console.log('files in queue', files.length);
					downloadFiles();
				} else {
					console.log('No file to download');
					process.exit(0);
				}


		}).catch(err => {
			console.log('error retrieving root folder ', err, dir, from);
		});
	})
}

function downloadFiles() {
	var n = 0;
	downloadFile(files[n]);
	var remoteDwnlSubscription = remoteDwnlSubject.subscribe(() => {
		n++;
		if (n < files.length)
			downloadFile(files[n], `${n} of ${files.length}`);
		else {
			console.log('DOWNLOAD COMPLETE!', n);
			if (typeof watcher === 'undefined' )
				watchProject();
			}
	});
}

var queue=1;
var queued=0;
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
			actualDownload();
		});
	else actualDownload();

	function actualDownload() {
		scpConn.download(
			upath.join(FEconfig.server.root, f),
			path.join(FEconfig.localRoot, f),
			(err, ok) => {
				if (err) {
					console.log('error downloading', upath.join(FEconfig.server.root, f), err);
					process.exit(1);
				} else {
					console.log('downloaded', f, pct);
					remoteDwnlSubject.next();
				}
			});
	}
}

function watchProject() {

	let watchOptions = {
		recursive: true,
		/*filter: (name) => {
			return (multimatch(upath.join(name), excludeDirs).length > 0);
		}*/
	};

	console.log('Watching for changes in ',FEconfig.projectName)

	watcher = watch(FEconfig.localRoot, watchOptions, function(evt, name) {
		console.log('evt',evt,name)
		name = name.replace(FEconfig.localRoot, '');
		let info= fs.statSync(path.join(FEconfig.localRoot, name));
		if (evt === 'update' && info.isFile())
			upload(name);
	});
}

function upload(f) {

	let from = path.join(FEconfig.localRoot, f);
	let to = upath.join(FEconfig.server.root, f);
	try{
		scpConn.upload(from, to, (err, ok) => {
			if (err) {
				console.log('error uploading', upath.join(FEconfig.server.root, f), err);
				process.exit(1);
			} else {
				console.log('uploaded', f);
			}
		});
	}
	catch(err){

	}
}

process.on('SIGINT', () => {
	sshConn.end();
	scpConn.close();
	if (watcher) watcher.close();
	watcher=undefined;
	console.log('connection closed');

	//rm.sync(FEconfig.localRoot);
	setTimeout(() => {
		process.exit(0);
	}, 2000);
});