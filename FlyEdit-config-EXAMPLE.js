const path=require('path'),
	fs=require('fs');


module.exports=(project)=>{

	return {
		projectName:project,
		localRoot:path.join(__dirname,project,'/projects/'),
		maxFileSize:2000000, // 2 mb
		server:{
			root:path.join('/remote/project/parent_dir/',project,'/'),
			port:22,
			host:'',
			username:'',
			password:''
		}
}};