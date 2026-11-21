const test=require('node:test'),assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {updatesEnabled,createUpdates}=require('../src/updates.cjs');
test('updates run only for packaged, normal, installed sessions',()=>{
 const flags={packaged:true,smoke:false,privateMode:false,portable:false};assert.equal(updatesEnabled(flags),true);for(const changes of [{packaged:false},{smoke:true},{privateMode:true},{portable:true}])assert.equal(updatesEnabled({...flags,...changes}),false);
});
test('updater delays checks, handles offline errors, waits for explicit restart and clears timers',async()=>{
 const updater=new EventEmitter();let checks=0,installs=0,notifications=0,initial,periodic;updater.checkForUpdates=async()=>{checks++;throw Error('offline');};updater.quitAndInstall=()=>installs++;
 const cleared=[];const service=createUpdates({enabled:true,load:()=>updater,notify:()=>notifications++,setTimeoutImpl:(fn,delay)=>{initial=fn;assert.equal(delay,10000);return 1;},setIntervalImpl:(fn,delay)=>{periodic=fn;assert.equal(delay,21600000);return 2;},clearTimeoutImpl:id=>cleared.push(id),clearIntervalImpl:id=>cleared.push(id)});
 service.install();assert.equal(installs,0);assert.equal(checks,0);initial();await new Promise(setImmediate);assert.equal(updater.autoDownload,true);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(checks,1);periodic();await new Promise(setImmediate);assert.equal(checks,2);updater.emit('error',Error('offline'));updater.emit('update-downloaded',{version:'0.12.0'});assert.deepEqual(service.snapshot(),{version:'0.12.0'});assert.equal(notifications,1);assert.equal(installs,0);service.install();assert.equal(installs,1);service.close();assert.deepEqual(cleared,[1,2]);
});
test('disabled updater never loads its dependency',()=>{const service=createUpdates({enabled:false,load:()=>{throw Error('must not load');},notify(){}});assert.equal(service.snapshot(),null);service.install();service.close();});
