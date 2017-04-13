const upath=require('upath');
const path=require('path');
const scp = require('scp2');

const watch = require('node-watch');
const fs = require('fs')

var excludeDirs=[ "node_modules" , ".git" ];
var Client = require('ssh2').Client;



var remoteDir={
	"/":{}
}



var conn = new Client();
const FEconfig = require('./FlyEdit.js');
console.log(FEconfig)
var sftp;


conn.on('ready', function() {
  console.log('Client :: ready');

	conn.sftp(function(err, sftp) {
	    if (err) throw(err);


	  	getDirectory(remoteDir["/"],conn).
	  		then((list)=>{
	  			//console.log(list);
	  			list.map(child=>{

	  			})
	  		})
	});
}).connect(FEconfig.server);

function getDirectory(dir,from){
	if (typeof from !='string') from = FEconfig.server.root;
	return new Promise((resolve,reject)=>{
	    sftp.readdir(path.join(from,dir), function(err, list) {
	      if (err) reject(err);
	      resolve(list);
	    });
	});
}




