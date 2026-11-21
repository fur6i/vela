const {destination,searchDestination}=require('./navigation.cjs');
const ENDPOINTS={google:'https://suggestqueries.google.com/complete/search?client=firefox&q=',bing:'https://api.bing.com/osjson.aspx?query=',brave:'https://search.brave.com/api/suggest?rich=false&q=',ecosia:'https://ac.ecosia.org/autocomplete?type=list&q='};
function recentTabs(tabs,space,query=''){
  const match=query.toLocaleLowerCase();
  return tabs.filter(tab=>tab.space===space&&tab.url!=='vela://start'&&(!match||`${tab.title} ${tab.url}`.toLocaleLowerCase().includes(match))).sort((a,b)=>(b.lastActive||0)-(a.lastActive||0)||b.id-a.id).slice(0,2);
}
function canSuggest(query){return typeof query==='string'&&query.trim().length>=2&&query.length<=160&&destination(query,'google')===searchDestination(query,'google');}
class SearchSuggestions{
  constructor(fetch){this.fetch=fetch;this.cache=new Map();}
  cancel(){this.controller?.abort();this.controller=null;}
  async get(query,engine,privateMode=false){
    this.cancel();if(privateMode||!canSuggest(query)||!Object.hasOwn(ENDPOINTS,engine||''))return [];
    query=query.trim();const key=engine+'\n'+query;
    if(this.cache.has(key))return [...this.cache.get(key)];
    const controller=this.controller=new AbortController();
    try{
      const response=await this.fetch(ENDPOINTS[engine]+encodeURIComponent(query),{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(3000)])});
      if(!response.ok||!response.body)return [];
      const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>65536)throw Error('Response too large');chunks.push(Buffer.from(chunk));}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const items=Array.isArray(data?.[1])?[...new Set(data[1].filter(value=>typeof value==='string'&&value.trim()&&value.length<=160).map(value=>value.trim()))].filter(value=>value.toLocaleLowerCase()!==query.toLocaleLowerCase()).slice(0,5):[];
      if(controller.signal.aborted)return [];
      this.cache.set(key,items);if(this.cache.size>24)this.cache.delete(this.cache.keys().next().value);return [...items];
    }catch{return [];}finally{if(this.controller===controller)this.controller=null;}
  }
}
module.exports={recentTabs,canSuggest,SearchSuggestions};
