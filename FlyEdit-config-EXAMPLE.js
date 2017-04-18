const path=require('path'),
	upath=require('upath'),
	fs=require('fs');


module.exports=(project)=>{

	return {
		projectName:project,
		localRoot:path.join(__dirname,'/projects/',project,'/'),
		maxFileSize:2000000, // 2 mb
		server:{
			root:upath.join('/remote/project/parent_dir/',project,'/'),
			port:22,
			host:'__fill_data_here__',
			username:'__fill_data_here__',
			password:'__fill_data_here__'
		}
}};