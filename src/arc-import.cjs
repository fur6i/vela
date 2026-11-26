'use strict';
const {loginOrigin}=require('./password-vault.cjs');
const {createHash}=require('node:crypto');
const MAX_IMPORT_BYTES=8*1024*1024;
function bounded(text){if(typeof text!=='string'||Buffer.byteLength(text)>MAX_IMPORT_BYTES||text.includes('\0'))throw Error('Invalid import file');return text.replace(/^\uFEFF/,'');}
// RFC 4180 subset, including quoted commas, escaped quotes and multiline fields.
// No evaluation, HTML rendering, URL fetching, or third-party profile decryption.
function csvRows(input){
  const text=bounded(input),rows=[];let row=[],field='',quoted=false,closed=false;
  function cell(){row.push(field);field='';closed=false;if(row.length>32)throw Error('Too many CSV columns');}
  function record(){cell();if(row.some(value=>value))rows.push(row);row=[];if(rows.length>2001)throw Error('Too many credentials');}
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
    else if(c==='"'){if(field||closed)throw Error('Invalid CSV');quoted=true;}
    else if(c===',')cell();
    else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;record();}
    else{if(closed)throw Error('Invalid CSV');field+=c;}
    if(field.length>16384)throw Error('CSV field too large');
  }
  if(quoted)throw Error('Unclosed CSV field');if(field||row.length||closed)record();return rows;
}
function passwordImport(text){
  const [header,...rows]=csvRows(text);if(!header)throw Error('Empty CSV');
  const columns=header.map(value=>value.trim().toLowerCase());
  const u=columns.indexOf('url'),n=columns.indexOf('username'),p=columns.indexOf('password');
  if(u<0||n<0||p<0||new Set(columns).size!==columns.length)throw Error('Expected url, username, password columns');
  const entries=[];let skipped=0;
  for(const row of rows){try{
    const origin=loginOrigin(row[u]);if(typeof row[n]!=='string'||row[n].length>512||!row[p]||row[p].length>4096)throw Error();
    entries.push({origin,username:row[n],password:row[p]});
  }catch{skipped++;}}
  return {entries,skipped};
}
function publicLink(raw){try{const url=new URL(raw);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.href.length<=4096?url.href:null;}catch{return null;}}
function folderPath(value){
  return Array.isArray(value)?value.filter(part=>typeof part==='string'&&part.trim()).slice(0,12).map(part=>part.trim().slice(0,80)):[];
}
function arcSpaceId(name){return 'arc-'+createHash('sha256').update(name.slice(0,40)).digest('hex').slice(0,12);}
function arcImport(input){
  const text=bounded(input),links=[],seen=new Set();
  let group='Arc',section='tabs',spaceLevel=null,headings=[],bullets=[];
  for(const line of text.split(/\r?\n/)){
    const heading=/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if(heading){
      const level=heading[1].length,raw=heading[2].trim().replace(/\*\*/g,'');
      const space=/^(?:space|spazio)\s*[:–—-]\s*(.+)$/i.exec(raw);
      const folder=/^(?:📁|📂|(?:folder|cartella)\s*:)\s*(.+)$/iu.exec(raw);
      const name=raw.replace(/^[^\p{L}\p{N}]+/u,'');
      if(/^arc (?:data )?export/i.test(name)||/^(?:spaces|spazi)\s*:?$/i.test(name))continue;
      bullets=[];
      if(/^(favorites?|preferiti|pinned tabs?|schede fissate|tabs?|other tabs|folders?|cartelle)\s*:?$/i.test(name)){
        section=/^(favorites?|preferiti)/i.test(name)?'favorites':'tabs';headings=[];continue;
      }
      if(space||(!folder&&(spaceLevel===null||level<=spaceLevel))){
        group=(space?.[1]||raw).slice(0,80);spaceLevel=level;section='tabs';headings=[];
      }else{
        headings=headings.filter(item=>item.level<level);
        headings.push({level,name:folder?.[1]||raw});
      }
      continue;
    }
    const bullet=/^([ \t]*)(?:[-*+] |\d+\. )(.+)$/.exec(line);
    const indent=bullet?bullet[1].replace(/\t/g,'    ').length:0;
    if(line.trim())bullets=bullet?bullets.filter(item=>item.indent<indent):[];
    const markdown=[...line.matchAll(/\[([^\]\r\n]{0,200})\]\((https?:\/\/[^\s)]{1,4096})\)/g)].map(match=>({title:match[1],url:match[2]}));
    const candidates=markdown.length?markdown:[...line.matchAll(/https?:\/\/[^\s<>()]{1,4096}/g)].map(match=>({url:match[0],title:''}));
    if(!candidates.length&&bullet){
      const label=bullet[2].replace(/^\s*(?:📁|📂|(?:folder|cartella)\s*:)\s*/iu,'').replace(/\*\*/g,'').trim();
      if(label)bullets.push({indent,name:label});
    }
    const folder=folderPath([...headings,...bullets].map(item=>item.name));
    for(const candidate of candidates){
      const url=publicLink(candidate.url),key=JSON.stringify([group,folder,url]);
      if(!url||seen.has(key))continue;
      seen.add(key);links.push({url,title:(candidate.title||new URL(url).hostname).slice(0,80),group,folder,favorite:section==='favorites'&&!folder.length});
      if(links.length>1000)throw Error('Too many imported links');
    }
  }
  if(!links.length)throw Error('No supported links in export');return {links,groups:[...new Set(links.map(item=>item.group))]};
}
function planArcImport(links,{spaces,pins,tabs}){
  const nextSpaces={...spaces},importedTabs=[],favorites=[],moves=[],removedSpaces=[];
  const destinations=[];
  for(const link of links){
    const name=link.group.slice(0,40),existing=Object.entries(nextSpaces).find(([,space])=>space.name.toLocaleLowerCase()===name.toLocaleLowerCase());
    const id=existing?.[0]||arcSpaceId(name);
    if(!nextSpaces[id])nextSpaces[id]={name,emoji:'🌍',color:'#7686a5',image:null};
    destinations.push({url:link.url,title:link.title,space:id,folder:folderPath(link.folder),pinned:true,lazy:true,background:true});
    if(link.favorite&&!pins.some(pin=>pin.url===link.url)&&!favorites.some(pin=>pin.url===link.url))favorites.push({url:link.url,title:link.title});
  }
  // Older imports could hash a folder name into a space ID. Only repair a
  // space when every tab has one unambiguous destination in this export.
  const spaceIds=new Set(destinations.map(tab=>tab.space));
  const projected=tabs.map(tab=>({...tab,original:tab}));
  for(const [id,config] of Object.entries(spaces)){
    if(!id.startsWith('arc-')||spaceIds.has(id)||id!==arcSpaceId(config.name))continue;
    const members=projected.filter(tab=>tab.space===id);
    if(!members.length)continue;
    const folderName=config.name.replace(/^\s*(?:📁|📂|(?:folder|cartella)\s*:)\s*/iu,'').slice(0,40);
    const matches=members.map(tab=>destinations.filter(target=>target.url===tab.url&&target.folder.some(part=>part.slice(0,40)===folderName)));
    if(matches.some(match=>match.length!==1))continue;
    for(const [i,tab] of members.entries()){
      const {space,folder}=matches[i][0];Object.assign(tab,{space,folder});
      moves.push({tab:tab.original,space,folder});
    }
    delete nextSpaces[id];removedSpaces.push({id,to:matches[0][0].space});
  }
  const claimed=new Set();
  for(const target of destinations){
    const samePath=tab=>JSON.stringify(folderPath(tab.folder))===JSON.stringify(target.folder);
    const candidates=projected.filter(tab=>tab.url===target.url&&tab.space===target.space);
    const existing=candidates.find(samePath);
    if(existing){claimed.add(existing);continue;}
    const legacy=target.folder.length&&candidates.find(tab=>!claimed.has(tab)&&!folderPath(tab.folder).length&&tab.pinned);
    if(legacy){claimed.add(legacy);legacy.folder=target.folder;moves.push({tab:legacy.original,space:target.space,folder:target.folder});continue;}
    if(!importedTabs.some(tab=>tab.url===target.url&&tab.space===target.space&&samePath(tab)))importedTabs.push(target);
  }
  if(Object.keys(nextSpaces).length>20||tabs.length+importedTabs.length>80||pins.length+favorites.length>256)throw Error('Import exceeds space, tab or favorite limits');
  return {spaces:nextSpaces,tabs:importedTabs,favorites,moves,removedSpaces};
}
module.exports={MAX_IMPORT_BYTES,passwordImport,arcImport,csvRows,publicLink,planArcImport,folderPath};
