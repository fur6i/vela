const zlib=require('node:zlib');const {crc32}=require('./extension-package.cjs');const {isWeb}=require('./navigation.cjs');
function pngChunk(name,data){const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);}
function icoPng(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<22||buffer.length>262144||buffer.readUInt16LE(0)!==0||buffer.readUInt16LE(2)!==1)return null;
 const count=buffer.readUInt16LE(4);if(!count||count>64||6+count*16>buffer.length)return null;
 const entries=[];for(let index=0;index<count;index++){const at=6+index*16,width=buffer[at]||256,height=buffer[at+1]||256,size=buffer.readUInt32LE(at+8),offset=buffer.readUInt32LE(at+12);if(offset>=6+count*16&&size>=40&&offset+size<=buffer.length)entries.push({width,height,frame:buffer.subarray(offset,offset+size)});}
 for(const {width,height,frame} of entries.sort((a,b)=>b.width-a.width))try{
  if(frame.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))){if(frame.length>=24&&frame.readUInt32BE(16)<=256&&frame.readUInt32BE(20)<=256)return frame;continue;}
  const header=frame.readUInt32LE(0),w=frame.readInt32LE(4),h=frame.readInt32LE(8),bits=frame.readUInt16LE(14);
  if(header<40||header>124||header>frame.length||w!==width||Math.abs(h)!==height*2||frame.readUInt16LE(12)!==1||frame.readUInt32LE(16)!==0||![1,4,8,24,32].includes(bits))continue;
  const colors=bits<=8?(frame.readUInt32LE(32)||1<<bits):0;if(colors>256)continue;
  const start=header+colors*4,stride=Math.ceil(width*bits/32)*4,maskStart=start+stride*height,maskStride=Math.ceil(width/32)*4;if(maskStart>frame.length)continue;
  const raw=Buffer.alloc((width*4+1)*height);let hasAlpha=false;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const row=h>0?height-1-y:y,source=start+row*stride,target=y*(width*4+1)+1+x*4;let pixel;
   if(bits>=24)pixel=source+x*(bits/8);else{const index=(frame[source+Math.floor(x*bits/8)]>>>(8-bits-(x*bits)%8))&((1<<bits)-1);if(index>=colors)throw Error('ICO palette');pixel=header+index*4;}
   raw[target]=frame[pixel+2];raw[target+1]=frame[pixel+1];raw[target+2]=frame[pixel];raw[target+3]=bits===32?frame[pixel+3]:255;if(raw[target+3])hasAlpha=true;
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const alpha=y*(width*4+1)+1+x*4+3,row=h>0?height-1-y:y;if(bits===32&&!hasAlpha)raw[alpha]=255;if(maskStart+maskStride*height<=frame.length&&frame[maskStart+row*maskStride+(x>>3)]&(128>>(x%8)))raw[alpha]=0;}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),pngChunk('IHDR',ihdr),pngChunk('IDAT',zlib.deflateSync(raw)),pngChunk('IEND',Buffer.alloc(0))]);
 }catch{}
 return null;
}
function rasterDimensions(buffer){
 if(buffer.length>=33&&buffer.toString('hex',0,8)==='89504e470d0a1a0a'&&buffer.readUInt32BE(8)===13&&buffer.toString('ascii',12,16)==='IHDR')return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
 if(buffer.length<4||buffer.readUInt16BE(0)!==0xffd8)return null;
 for(let offset=2;offset+4<=buffer.length;){if(buffer[offset++]!==255)return null;while(offset<buffer.length&&buffer[offset]===255)offset++;if(offset>=buffer.length)return null;const marker=buffer[offset++];if(marker===0xda||marker===0xd9)return null;if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
  if(offset+2>buffer.length)return null;const length=buffer.readUInt16BE(offset);if(length<2||offset+length>buffer.length)return null;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return length>=8?{width:buffer.readUInt16BE(offset+5),height:buffer.readUInt16BE(offset+3)}:null;offset+=length;
 }return null;
}
class Favicons{
 constructor(fetchImpl,nativeImage){this.fetch=fetchImpl;this.nativeImage=nativeImage;this.cache=new Map();this.pending=new Map();this.active=0;this.waiters=[];}
 get(page,candidates=[]){if(!isWeb(page))return Promise.resolve(null);const origin=new URL(page).origin,key=origin+'|'+candidates.join('|'),cached=this.cache.get(origin);if(!candidates.length&&cached&&cached.expires>Date.now())return Promise.resolve(cached.value);if(this.pending.has(key))return this.pending.get(key);
 const job=this.load(origin,candidates).then(value=>{const previous=this.cache.get(origin);if(!value&&previous?.value&&previous.expires>Date.now())return previous.value;this.cache.delete(origin);this.cache.set(origin,{value,expires:Date.now()+(value?86400000:60000)});while(this.cache.size>128)this.cache.delete(this.cache.keys().next().value);return value;}).finally(()=>this.pending.delete(key));this.pending.set(key,job);return job;}
 async load(origin,candidates){if(this.active>=3)await new Promise(resolve=>this.waiters.push(resolve));else this.active++;
 try{for(const source of [...new Set([...candidates,origin+'/favicon.ico',origin+'/apple-touch-icon.png'])].slice(0,12)){if(!isWeb(source))continue;try{
  const response=await this.fetch(source,{signal:AbortSignal.timeout(5000),credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok||!response.body)continue;const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>262144)throw Error('Icon too large');chunks.push(Buffer.from(chunk));}
  const buffer=Buffer.concat(chunks),raster=icoPng(buffer)||buffer,declared=rasterDimensions(raster);if(!declared||declared.width<1||declared.height<1||declared.width>1024||declared.height>1024)continue;
  const image=this.nativeImage.createFromBuffer(raster);if(image.isEmpty())continue;const dimensions=image.getSize();if(dimensions.width>1024||dimensions.height>1024)continue;
  return {favicon:image.resize({width:32,height:32}).toDataURL(),source};
 }catch{}}return null;}finally{const next=this.waiters.shift();if(next)next();else this.active--;}}
}
module.exports={icoPng,Favicons,rasterDimensions};
