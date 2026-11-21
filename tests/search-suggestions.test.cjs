const test=require('node:test');const assert=require('node:assert/strict');
const {SearchSuggestions,recentTabs,canSuggest}=require('../src/search-suggestions.cjs');
test('launcher keeps exactly the two most recently used website tabs in the active space',()=>{
  const tabs=[{id:1,space:'personal',url:'vela://start',lastActive:99},{id:2,space:'personal',url:'https://a.test',title:'A',lastActive:30},{id:3,space:'work',url:'https://work.test',title:'Work',lastActive:100},{id:4,space:'personal',url:'https://b.test',title:'B',lastActive:10},{id:5,space:'personal',url:'https://c.test',title:'C',lastActive:20}];
  assert.deepEqual(recentTabs(tabs,'personal').map(tab=>tab.id),[2,5]);assert.deepEqual(recentTabs(tabs,'personal','B').map(tab=>tab.id),[4]);
});
test('suggestions use the selected provider, omit cookies, deduplicate and cache bounded results',async()=>{
  const calls=[];const service=new SearchSuggestions(async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(['how many',['how many','how many countries','how many countries','how many days',null]]));});
  assert.deepEqual(await service.get('how many','bing'),['how many countries','how many days']);assert.match(calls[0].url,/^https:\/\/api\.bing\.com/);assert.equal(calls[0].options.credentials,'omit');
  await service.get('how many','bing');assert.equal(calls.length,1);
  for(let index=0;index<26;index++)await service.get('query '+index,'google');assert.equal(service.cache.size,24);
});
test('private queries, URLs, local addresses and invalid providers never reach the suggestion server',async()=>{
  const service=new SearchSuggestions(()=>{throw Error('must not fetch')});
  for(const query of ['https://private.test/path','youtube.com','127.0.0.1','localhost:3000','file:///secret','C:\\secret.txt','x']){assert.equal(canSuggest(query),false);assert.deepEqual(await service.get(query,'google'),[]);}
  assert.deepEqual(await service.get('how many','google',true),[]);assert.deepEqual(await service.get('how many','unknown'),[]);
});
test('cancelled, malformed, oversized or failed suggestion responses fall back to local results',async()=>{
  let finish;const service=new SearchSuggestions(()=>new Promise(resolve=>{finish=resolve}));const pending=service.get('old query','google');service.cancel();finish(new Response('["old query",["stale suggestion"]]'));assert.deepEqual(await pending,[]);
  for(const response of [new Response('x'.repeat(65537)),new Response('{}'),new Response('not json'),new Response('',{status:503})]){const bad=new SearchSuggestions(async()=>response);assert.deepEqual(await bad.get('how many','google'),[]);}
});
