import {execFileSync} from 'node:child_process';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).split('\n');
for(const file of files)if(/\.(mjs|cjs)$/.test(file))execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
