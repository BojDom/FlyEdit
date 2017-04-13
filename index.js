"use strict"
const upath=require('upath');
const path=require('path');
const scp = require('scp2');
const _ = require('lodash');
const watch = require('node-watch');
var Promise = require('bluebird');
const fs = require('fs')
const rx = require('rxjs');
var excludeDirs=[ "node_modules" , ".git" ];
var Client = require('ssh2').Client;


var remoteDir={
	"/":{}
}

var conn = new Client();
const FEconfig = require('./FlyEdit-config.js');


var subject = new rx.Subject();

var subscription = subject.debounceTime(1000).subscribe(
    function (x) {
    	console.log('123',x)
    	fs.writeFile('./a.json',JSON.stringify(remoteDir),()=>{

    	})
    },
    function (err) {
        console.log('Error: ' + err);
    },
    function () {
        console.log('Completed');
    });

// => Next: 42

var sftp={};
conn.on('ready', function() {

	conn.sftp(function(err, sftpObj) {
		if (err) throw(err);
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


function getDirectory(dir,from){

	if (typeof from !='string') from = FEconfig.server.root;

	let dirr = upath.join(from,dir);

	sftp.readdir(dirr).then((list,err)=>{
			if (err) console.log('errore',err)
			let files = list.filter(f=>{
		      	return (f.attrs.size!=4096 && f.attrs.size<FEconfig.maxFileSize)
		     }).map(f=>{return f.filename})


			let dirs = list.filter(f=>{
				return (f.attrs.size==4096 && excludeDirs.indexOf(f.filename)<0)
			}).map(d=>{
				getDirectory(d.filename,dirr)
				return d.filename
			})
			
		    let relative = '["/"].'+(dirr.replace(FEconfig.server.root,'').split('/').join('.'));
		    if (relative.length==2) relative='/';


		    let content = files.concat(dirs);
			_.set(remoteDir,relative, content);
			subject.next('a')

	})
}