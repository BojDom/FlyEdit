const exec = require('child_process').exec;
const config = require('./FlyEdit-config');
const pm2 = require('pm2');
var argv = require('minimist')(process.argv.slice(2));

if (argv._) 
	argv._.map(project=>{
		console.log('starting',project)
		pm2.start({
			script:'./core.js',
			exec_mode : 'cluster', 
			args:'-p '+project,
		},(err)=>{
		console.log('err lunching pm2 '+project,err)
	});
});
