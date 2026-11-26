'use strict';
const {domainToASCII}=require('node:url');
const MAX_LIST_BYTES=1024*1024;
const MAX_LISTS=12;
const MAX_DOMAINS=20000;

function trackerHost(value){
  const host=domainToASCII(value.toLowerCase().replace(/\.$/,''));
  if(host.length>253||!host.includes('.')||!/[a-z]/.test(host.split('.').at(-1)))return null;
  return host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))?host:null;
}

function parseTrackerList(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>MAX_LIST_BYTES||text.includes('\0'))throw Error('Lista non valida o troppo grande.');
  const domains=new Set();let skipped=0;
  for(const raw of text.split(/\r?\n/)){
    const line=raw.replace(/\s+#.*$/,'').trim();
    if(!line||/^[!#\[]/.test(line))continue;
    const entry=/^(?:0\.0\.0\.0|127\.0\.0\.1|::1)\s+(.+)$/.exec(line);
    const simple=/^\|\|([^|^$/*]+)\^$/.exec(line);
    const values=entry?entry[1].split(/\s+/):[simple?.[1]||line];
    for(const value of values){
      const host=/^[\p{L}\p{N}.-]+$/u.test(value)?trackerHost(value):null;
      if(!host){skipped++;continue;}
      domains.add(host);
      if(domains.size>MAX_DOMAINS)throw Error('La lista supera il limite di domini.');
    }
  }
  if(!domains.size)throw Error('La lista non contiene domini supportati.');
  return {domains:[...domains],skipped};
}

function restoreTrackerLists(value){
  if(!Array.isArray(value))return [];
  const seen=new Set();
  return value.slice(0,MAX_LISTS).flatMap(list=>{
    if(!list||typeof list.id!=='string'||!(/^[a-f0-9]{16}$/).test(list.id)||seen.has(list.id)||
      typeof list.name!=='string'||!list.name.trim()||list.name.length>80||!Array.isArray(list.domains))return [];
    const domains=[...new Set(list.domains.slice(0,MAX_DOMAINS).filter(domain=>typeof domain==='string'&&domain.length<=253&&/^[a-z0-9.-]+$/.test(domain)&&trackerHost(domain)===domain))];
    if(!domains.length)return [];
    seen.add(list.id);
    return [{id:list.id,name:list.name,enabled:list.enabled!==false,domains}];
  });
}

function trackerIndex(lists){
  return new Set(lists.filter(list=>list.enabled).flatMap(list=>list.domains));
}

function matchesTracker(index,url){
  if(!index.size)return false;
  let parsed;
  try{parsed=new URL(url);}catch{return false;}
  if(!['http:','https:','ws:','wss:'].includes(parsed.protocol))return false;
  let host=parsed.hostname.replace(/\.$/,'');
  for(let dot=host.indexOf('.');dot!==-1;dot=host.indexOf('.')){
    if(index.has(host))return true;
    host=host.slice(dot+1);
  }
  return false;
}
module.exports={MAX_LIST_BYTES,MAX_LISTS,parseTrackerList,restoreTrackerLists,trackerIndex,matchesTracker};
