class ThumbnailCache{
  constructor(limit=20){this.limit=limit;this.items=new Map();}
  set(tab,value){this.items.delete(tab.id);tab.thumbnail=value;this.items.set(tab.id,tab);while(this.items.size>this.limit)this.delete(this.items.keys().next().value);}
  delete(id){const tab=this.items.get(id);if(tab)delete tab.thumbnail;this.items.delete(id);}
}
module.exports={ThumbnailCache};
