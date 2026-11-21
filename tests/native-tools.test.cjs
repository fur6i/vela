const test=require('node:test'),assert=require('node:assert/strict');
const {mediaUrl,videoArgs}=require('../src/video-tools.cjs');
const {publicAddresses,mediaProxy}=require('../src/public-media.cjs');
const {volumeProgram,cleanName}=require('../src/native-tools.cjs');
test('media URLs accept public HTTPS and reject credentials, non-HTTPS and local/reserved networks',()=>{
 assert.equal(mediaUrl('https://example.com/video?a=1'),'https://example.com/video?a=1');
 for(const host of ['localhost','localhost.','a.local','a.localhost','127.0.0.1','127.1','0x7f000001','10.2.3.4','192.168.1.1','172.16.1.1','172.31.255.1','169.254.1.1','[::1]','[::ffff:127.0.0.1]','[fc00::1]','100.64.0.1'])assert.equal(mediaUrl('https://'+host),null,host);
 for(const url of ['http://example.com','file:///secret','https://user:pass@example.com','https://user@example.com'])assert.equal(mediaUrl(url),null);
 const args=videoArgs('C:\\Vela tools','https://example.com/video','mp4','C:\\test & safe\\video.%(ext)s');assert.ok(args.includes('bestvideo*+bestaudio/best'));assert.ok(args.includes('--ignore-config'));assert.ok(args.includes('--no-plugin-dirs'));assert.equal(args.at(-2),'--');assert.equal(args.at(-1),'https://example.com/video');assert.throws(()=>videoArgs('x','https://example.com','exe','x'));
});
test('media DNS validation rejects private answers, including mixed public/private DNS',async()=>{
 assert.deepEqual(await publicAddresses('example.com',async()=>[{address:'8.8.8.8',family:4}]),[{address:'8.8.8.8',family:4}]);
 for(const addresses of [[],[{address:'10.0.0.1',family:4}],[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]])await assert.rejects(publicAddresses('example.com',async()=>addresses));
 await assert.rejects(publicAddresses('127.0.0.1'));
});
test('media proxy blocks direct HTTP and CONNECT to local targets',async()=>{
 const proxy=await mediaProxy();try{
  const response=await fetch(proxy.url);assert.equal(response.status,403);
  const net=require('node:net');const reply=await new Promise((resolve,reject)=>{const socket=net.connect(new URL(proxy.url).port,'127.0.0.1',()=>socket.write('CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n'));socket.on('error',reject);socket.once('data',data=>{socket.destroy();resolve(data.toString());});});assert.match(reply,/403 Forbidden/);
 }finally{proxy.close();}
});
test('native tool inputs are bounded and output names cannot inject paths',()=>{
 assert.throws(()=>volumeProgram(601));assert.throws(()=>volumeProgram('100;alert(1)'));assert.ok(volumeProgram(600).includes('const level = 600 / 100'));assert.equal(cleanName('../test%\\video?.mp4'),'.._test__video_.mp4');
});
test('tool preparation uses the injected transport and rejects bad SHA-256 before installing binaries',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{ensureVideoTools}=require('../src/video-tools.cjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'vela-tools-check-')),calls=[];
 const asset='https://github.com/yt-dlp/yt-dlp/releases/download/test/yt-dlp.exe',checksum='https://github.com/yt-dlp/yt-dlp/releases/download/test/SHA2-256SUMS';
 try{await assert.rejects(ensureVideoTools(root,()=>{},undefined,false,async(url,options)=>{calls.push(url);assert.equal(options.credentials,'omit');if(calls.length===1)return new Response(JSON.stringify({tag_name:'test',assets:[{name:'yt-dlp.exe',browser_download_url:asset,size:5},{name:'SHA2-256SUMS',browser_download_url:checksum}]}));if(url===checksum)return new Response('0'.repeat(64)+'  yt-dlp.exe');return new Response('untrusted bytes');}),/Verifica del componente fallita/);assert.equal(calls.length,3);assert.equal(fs.existsSync(path.join(root,'yt-dlp.exe')),false);assert.deepEqual(fs.readdirSync(root),[]);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
