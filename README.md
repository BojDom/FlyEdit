# FlyEdit
Transfer a remote folder trought scp, edit files locally and upload them on changes

Bored of using sftp clients , rsync etc... , or you change often the workstation to make just simple edits  ?
FlyEdit makes your workflow straight to the target in a simple way


# To Do list

  - [x] pm2 process
  - [x] provide different configurations for different projects
  - [x] move remote files to a temporary folder instead of just overwrite them
  - [ ] optionally delete local project on close
  - [x] check if files are already downloaded and overwrite them only if they are older than remote
  - [ ] handle lost server connection
  - [ ] find out other usefool functions

# Known issues 

Windows seems to not permit to edit the last modification time, this cause to upload files on process restart since they looks newer.
