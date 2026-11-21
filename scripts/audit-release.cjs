const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const directories=['src','tests','scripts','assets','.github'];
const rootFiles=['package.json','package-lock.json','.gitignore','LICENSE','THIRD_PARTY_NOTICES.txt','README.md','README.it.md','SECURITY.md','PERFORMANCE.md'];
const excluded=/(?:^|\/)(?:node_modules|release|dist|build|\.git|\.smoke-profile|\.native-tools-test|__pycache__|\.venv)(?:\/|$)|(?:^|\/)(?:profile(?:\.json)?|verification\.json|smoke-error\.json|\.env(?:\..*)?|.*-preview\.png|preview\.png|youtube-.*\.(?:png|json)|performance-.*\.json|.*\.(?:bin|log|key|pem|crx|exe|dll|zip|woff2?))$/i;
function fileList(root){const files=[];function visit(relative){if(excluded.test(relative))throw Error('Forbidden export path: '+relative);const absolute=path.join(root,relative),stat=fs.lstatSync(absolute);if(stat.isSymbolicLink())throw Error('Symbolic link refused: '+relative);if(stat.isDirectory()){for(const name of fs.readdirSync(absolute))visit(relative+'/'+name);}else if(stat.isFile())files.push(relative);else throw Error('Special file refused: '+relative);}for(const relative of [...directories,...rootFiles])visit(relative);return files.sort();}
function audit(root){const files=fileList(root),findings=[];for(const file of files){if(file==='package-lock.json')continue; // The lock is copied byte-for-byte, never inspected.
 if(/\.(?:png|ico)$/i.test(file))continue;
 const text=fs.readFileSync(path.join(root,file),'utf8');for(const [kind,pattern] of [
 ['personal local path',/[A-Z]:[\\/](?:Users|Documents and Settings)[\\/][^\s"'<>]+/i],
 ['credential',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|AKIA[A-Z0-9]{16})\b/],
 ['embedded private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['hardcoded API secret',/(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9_+\/-]{32,}["']/i]
 ])if(pattern.test(text))findings.push(file+': '+kind);
 }
 if(findings.length)throw Error('Export scan failed:\n'+findings.join('\n'));
 return {files,total:files.length,bytes:files.reduce((sum,file)=>sum+fs.statSync(path.join(root,file)).size,0),contentHash:crypto.createHash('sha256').update(files.filter(file=>file!=='package-lock.json').map(file=>file+'\0'+crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')).join('\n')).digest('hex')};
}
module.exports={directories,rootFiles,fileList,audit};
if(require.main===module){try{const report=audit(path.resolve(__dirname,'..'));console.log(JSON.stringify({audit:'PASS',files:report.total,bytes:report.bytes,contentHash:report.contentHash}));}catch(error){console.error(error.message);process.exitCode=1;}}
