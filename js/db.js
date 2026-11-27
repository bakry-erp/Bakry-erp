/* معرض البكري ERP — Local IndexedDB adapter (no server dependency) */
const MotoDB = {
  dbName: 'bakry_erp_local',
  version: 2,
  stores: ['customers','guarantors','suppliers','products','units','sales','installments','transactions','supplier_dues','audit_logs','branches','defaults','traffic','notifications','collection_notes'],
  db: null,
  init() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('هذا المتصفح لا يدعم التخزين المحلي IndexedDB.'));
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        this.stores.forEach(name => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        });
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => this.db.close();
        resolve(true);
      };
      request.onerror = () => reject(request.error || new Error('تعذر فتح قاعدة البيانات المحلية.'));
      request.onblocked = () => console.warn('أغلق أي تبويب قديم من البرنامج ثم أعد التحميل.');
    });
  },
  _store(name, mode='readonly') {
    if (!this.db) throw new Error('التخزين المحلي لم يبدأ بعد');
    if (!this.stores.includes(name)) throw new Error('جدول غير معروف: ' + name);
    return this.db.transaction(name, mode).objectStore(name);
  },
  getAll(name) { return new Promise((resolve,reject)=>{ let r; try { r=this._store(name).getAll(); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result||[]); r.onerror=()=>reject(r.error); }); },
  getById(name,id) { return new Promise((resolve,reject)=>{ let r; try { r=this._store(name).get(Number(id)); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>reject(r.error); }); },
  add(name,item) { return new Promise((resolve,reject)=>{ let r; try { const data={...item}; if(data.id===undefined||data.id===null||data.id==='') delete data.id; r=this._store(name,'readwrite').add(data); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error||new Error('فشل الحفظ المحلي')); }); },
  update(name,item) { return new Promise((resolve,reject)=>{ let r; try { if(item.id===undefined||item.id===null) throw new Error('معرّف السجل غير موجود'); r=this._store(name,'readwrite').put({...item,id:Number(item.id)}); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error||new Error('فشل التحديث المحلي')); }); },
  updateBatch(name,items) { return new Promise((resolve,reject)=>{ let tx; try { tx=this.db.transaction(name,'readwrite'); const st=tx.objectStore(name); (items||[]).forEach(item=>{ if(item.id!==undefined&&item.id!==null) st.put({...item,id:Number(item.id)}); }); } catch(e){reject(e);return;} tx.oncomplete=()=>resolve(true); tx.onerror=()=>reject(tx.error||new Error('فشل تحديث البيانات')); tx.onabort=()=>reject(tx.error||new Error('تم إلغاء تحديث البيانات')); }); },
  delete(name,id) { return new Promise((resolve,reject)=>{ let r; try {r=this._store(name,'readwrite').delete(Number(id));}catch(e){reject(e);return;} r.onsuccess=()=>resolve(true); r.onerror=()=>reject(r.error); }); },
  async generateNextCode(name,prefix) { const rows=await this.getAll(name); let max=1000; rows.forEach(x=>{const m=String(x.code||'').match(/-(\d+)$/);if(m)max=Math.max(max,Number(m[1]));}); return `${prefix}-${max+1}`; },
  async generateNextInvoiceNo() { const rows=await this.getAll('sales'); let max=1000; rows.forEach(x=>{const m=String(x.invoiceNo||'').match(/-(\d+)$/);if(m)max=Math.max(max,Number(m[1]));}); return `INV-${max+1}`; },
  async generateNextTxCode() { return this.generateNextCode('transactions','TX'); },
  async checkAndSeedData() { return true; }
};
