const {test}=require('node:test'),assert=require('node:assert/strict');
const {passwordImport,arcImport,csvRows,planArcImport,MAX_IMPORT_BYTES}=require('../src/arc-import.cjs');
test('Arc password CSV handles BOM, Unicode, quoted separators, escaped quotes and embedded newlines',()=>{
  const result=passwordImport('\uFEFFname,url,username,password,note\r\nExample,https://example.test/path,"name,with comma","pass""word\nline",\r\nInsecure,http://bad.test,x,nope,\r\n');
  assert.equal(result.entries.length,1);assert.equal(result.entries[0].origin,'https://example.test');assert.equal(result.entries[0].username,'name,with comma');assert.equal(result.entries[0].password,'pass"word\nline');assert.equal(result.skipped,1);
});
test('Arc migration recreates spaces and dormant tabs, keeps existing data and rejects oversized plans atomically',()=>{
  const spaces=require('../src/spaces.cjs').spacesFromProfile();
  const links=arcImport('## Research\n### Favorites\n- [One](https://one.test/)\n## Travel\n- [Same](https://one.test/)').links;
  const plan=planArcImport(links,{spaces,pins:[],tabs:[]});assert.equal(plan.tabs.length,2);assert.equal(plan.favorites.length,1);assert.equal(Object.keys(plan.spaces).length,4);assert.ok(plan.tabs.every(tab=>tab.lazy&&tab.background));assert.notEqual(plan.tabs[0].space,plan.tabs[1].space);assert.equal(Object.keys(spaces).length,2);
  const restored=require('../src/spaces.cjs').spacesFromProfile(plan.spaces);assert.equal(Object.keys(restored).length,4);
  assert.throws(()=>planArcImport(links,{spaces,pins:[],tabs:Array.from({length:80},()=>({url:'https://existing.test',space:'personal'}))}),/limits/);
  assert.equal(planArcImport(links,{spaces:plan.spaces,pins:plan.favorites,tabs:plan.tabs}).tabs.length,0);
});
test('invalid CSV is rejected before import; URLs and row/field/file budgets are enforced',()=>{
  for(const value of ['url,username,password\n"unclosed','url,username,password\n"x"tail,u,p','url,username,url\na,b,c','a,b,c','x'.repeat(MAX_IMPORT_BYTES+1)])assert.throws(()=>passwordImport(value));
  assert.throws(()=>csvRows('x'.repeat(17000)));assert.equal(passwordImport('url,username,password\nhttps://u:p@example.test,x,p\njavascript:alert(1),x,p').skipped,2);
});
test('Arc Markdown preserves group labels, deduplicates links and refuses executable/local protocols',()=>{
  const result=arcImport('# Arc Data Export\n## Work\n### Favorites\n- [Example](https://example.test/)\n### Pinned Tabs\nhttps://example.test/\n## Personal\n- https://second.test/\n- [bad](javascript:alert(1))\nfile:///private\n');
  assert.equal(result.links.length,2);assert.equal(result.links[0].group,'Work');assert.equal(result.links[0].favorite,true);assert.equal(result.links[1].group,'Personal');assert.throws(()=>arcImport('file:///private'));
});
test('Arc keeps nested folders inside the parent space and repairs old imports only when the mapping is clear',()=>{
  const {createHash}=require('node:crypto');
  const {spacesFromProfile}=require('../src/spaces.cjs');
  const legacyId='arc-'+createHash('sha256').update('📁 Progetti').digest('hex').slice(0,12);
  const spaces=spacesFromProfile({[legacyId]:{name:'📁 Progetti',emoji:'🌍',color:'#7686a5'}});
  const {links,groups}=arcImport('# Arc Data Export\n## Space: Studio\n## 📁 Progetti\n- **Clienti**\n  - [Uno](https://one.test/)\n- [Due](https://two.test/)\n## Space: Viaggi\n- [Mappa](https://map.test/)');
  assert.deepEqual(groups,['Studio','Viaggi']);
  assert.deepEqual(links.map(link=>link.folder),[['Progetti','Clienti'],['Progetti'],[]]);
  const existing={id:1,url:'https://one.test/',space:legacyId,pinned:true};
  const next=planArcImport(links,{spaces,pins:[],tabs:[existing]});
  assert.equal(next.tabs.length,2);
  assert.equal(next.spaces[legacyId],undefined);
  assert.deepEqual(next.moves.map(move=>[move.tab.id,move.folder]),[[1,['Progetti','Clienti']]]);
  assert.equal(existing.space,legacyId,'preview must not modify tabs');
  const other={id:2,url:'https://unmatched.test/',space:legacyId};
  assert.equal(planArcImport(links,{spaces,pins:[],tabs:[existing,other]}).spaces[legacyId].name,'📁 Progetti');
});
