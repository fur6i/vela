'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseTrackerList,restoreTrackerLists,trackerIndex,matchesTracker,MAX_LIST_BYTES}=require('../src/tracker-lists.cjs');

test('custom tracker lists accept domains, hosts and simple domain filters',()=>{
  const parsed=parseTrackerList('# Example\nTRACKER.test.\n0.0.0.0 ads.test pixel.test # inline note\n||münchen.test^\n@@||allowed.test^\n||rules.test^$script\nhttps://url.test/path');
  assert.deepEqual(parsed.domains,['tracker.test','ads.test','pixel.test','xn--mnchen-3ya.test']);
  assert.equal(parsed.skipped,3);
  assert.throws(()=>parseTrackerList('a'.repeat(MAX_LIST_BYTES+1)),/grande/);
  assert.throws(()=>parseTrackerList('@@||allowed.test^'),/domini/);
});

test('only enabled lists block exact domains and dot-delimited subdomains',()=>{
  const lists=restoreTrackerLists([
    {id:'0000000000000001',name:'One',domains:['tracker.test','tracker.test','url.test/a']},
    {id:'0000000000000002',name:'Off',enabled:false,domains:['off.test']}
  ]);
  assert.equal(lists[0].domains.length,1);
  const index=trackerIndex(lists);
  for(const url of ['https://tracker.test/','https://sub.tracker.test./','wss://tracker.test/'])assert.equal(matchesTracker(index,url),true);
  for(const url of ['https://nottracker.test/','https://tracker.test.attacker.test/','https://off.test/','file://tracker.test/path','malformed'])assert.equal(matchesTracker(index,url),false);
});
