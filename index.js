const exec = require('child_process').exec;
const config = require('./FlyEdit-config');
const pm2 = require('pm2');
var argv = require('minimist')(process.argv.slice(2));

var n =0;

if (argv._) 
	start(argv._[n])


		function start(project) {
			pm2.start({
				script:'./core.js',
				exec_mode : 'fork', 
				name:project,
				args:'-p '+project,
			},(err)=>{
				n++;
				if (n<argv._.length)
					start(argv._[n])
				else {
						console.log('to see transfer logs use pm2 logs "project_name" ');
						process.exit(0)
				}
			})
		}

