const {t}=require('./i18n.js');
const net=require('node:net');
const http=require('node:http');
const dns=require('node:dns').promises;
function publicHost(value){
  const host=String(value).toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))return false;
  const ip=net.isIP(host);
  if(ip===4){const [a,b,c]=host.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0&&[0,2].includes(c))||a===100&&b>=64&&b<=127||a===198&&([18,19].includes(b)||b===51&&c===100)||a===203&&b===0&&c===113);}
  if(ip===6)return /^[23][0-9a-f]{3}:/.test(host)&&!/^2001:(?:db8|0):/i.test(host)&&!host.startsWith('2002:');
  return host.includes('.')&&!host.includes('%');
}
function mediaUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&publicHost(url.hostname)?url.href:null;}catch{return null;}}
async function publicAddresses(host,lookup=dns.lookup,getLanguage=()=> 'it'){
  const tr=(key,vars)=>t(getLanguage(),key,vars);
  if(!publicHost(host))throw Error(tr("Indirizzo locale o riservato non consentito."));
  const addresses=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await lookup(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(item=>!net.isIP(item.address)||!publicHost(item.address)))throw Error(tr("La destinazione risolve verso una rete privata o riservata."));
  return addresses;
}
async function mediaProxy(signal){
  const sockets=new Set();const server=http.createServer((_req,res)=>{res.writeHead(403);res.end('HTTPS only');});
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});});
  server.on('connect',async(req,client,head)=>{
    try{const url=new URL('https://'+req.url);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error();
      const host=url.hostname.replace(/^\[|\]$/g,''),addresses=await publicAddresses(host);if(client.destroyed||signal?.aborted)throw Error();
      const upstream=net.connect({host:addresses[0].address,family:addresses[0].family,port:Number(url.port||443)});sockets.add(upstream);
      upstream.setTimeout(30000,()=>upstream.destroy());upstream.on('error',()=>client.destroy());upstream.on('close',()=>{sockets.delete(upstream);client.destroy();});client.on('close',()=>upstream.destroy());
      upstream.once('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
    }catch{client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}
  });
  const close=()=>{for(const socket of sockets)socket.destroy();server.close();signal?.removeEventListener('abort',close);};
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});signal?.addEventListener('abort',close,{once:true});if(signal?.aborted)close();
  return {url:`http://127.0.0.1:${server.address()?.port}`,close};
}
module.exports={mediaUrl,publicHost,publicAddresses,mediaProxy};
