const path=require('path'),
	upath=require('upath'),
	fs=require('fs');


module.exports=[

	project1: {
		projectName:"p1",
		localRoot:path.join(__dirname,'/projects/p1/'),
		maxFileSize:2000000, // 2 mb
		server:{
			root:'/remote/project/folder/root/',
			port:22,
			host:'__fill_data_here__',
			username:'__fill_data_here__',
			password:'__fill_data_here__'
		}
]
