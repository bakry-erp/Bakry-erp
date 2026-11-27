/* Bakry ERP local-first IndexedDB storage. No server/API requests. */
const MotoDB = {
  dbName:'bakry_erp_local', version:1,
  stores:['customers','guarantors','suppliers','products','units','sales','installments','transactions','supplier_dues','audit_logs','branches','defaults','traffic','notifications'],
  db:null,
  init(){ return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject('المتصفح لا يدعم التخزين المحلي. استخدم متصفحاً حديثاً.');return;}
    const req=indexedDB.open(this.dbName,this.version);
    req.onupgradeneeded=()=>{const d=req.result; this.stores.forEach(n=>{if(!d.objectStoreNames.contains(n))d.createObjectStore(n,{keyPath:'id',autoIncrement:true});});};
    req.onsuccess=()=>{this.db=req.result;resolve();}; req.onerror=()=>reject('تعذر فتح التخزين المحلي على هذا الجهاز.');
  });},
  _store(n,mode='readonly'){if(!this.db)throw new Error('قاعدة البيانات المحلية غير جاهزة');if(!this.stores.includes(n))throw new Error('اسم جدول غير معروف: '+n);return this.db.transaction(n,mode).objectStore(n);},
  getAll(n){return new Promise((res,rej)=>{const r=this._store(n).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej('فشل قراءة البيانات المحلية');});},
  getById(n,id){return new Promise((res,rej)=>{const r=this._store(n).get(Number(id));r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej('فشل قراءة السجل المحلي');});},
  add(n,item){return new Promise((res,rej)=>{const x={...item};delete x.id;const r=this._store(n,'readwrite').add(x);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error?.name==='ConstraintError'?'السجل موجود بالفعل':'فشل حفظ السجل محلياً');});},
  update(n,item){return new Promise((res,rej)=>{const r=this._store(n,'readwrite').put({...item,id:Number(item.id)});r.onsuccess=()=>res(r.result);r.onerror=()=>rej('فشل تحديث السجل محلياً');});},
  updateBatch(n,items){return new Promise((res,rej)=>{const tx=this.db.transaction(n,'readwrite'),s=tx.objectStore(n);items.forEach(x=>s.put({...x,id:Number(x.id)}));tx.oncomplete=()=>res();tx.onerror=()=>rej('فشل تحديث البيانات محلياً');});},
  delete(n,id){return new Promise((res,rej)=>{const r=this._store(n,'readwrite').delete(Number(id));r.onsuccess=()=>res(true);r.onerror=()=>rej('فشل حذف السجل محلياً');});},
  async generateNextCode(n,p){const a=await this.getAll(n);let m=1000;a.forEach(x=>{const z=String(x.code||'').split('-');if(z.length===2&&Number(z[1])>m)m=Number(z[1]);});return `${p}-${m+1}`;},
  async generateNextInvoiceNo(){const a=await this.getAll('sales');let m=1000;a.forEach(x=>{const z=String(x.invoiceNo||'').split('-');if(z.length===2&&Number(z[1])>m)m=Number(z[1]);});return `INV-${m+1}`;},
  async generateNextTxCode(){return this.generateNextCode('transactions','TX');},
  async checkAndSeedData(){return;}
};
