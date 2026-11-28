/* معرض البكري ERP — Local IndexedDB adapter (no server dependency) */
const MotoDB = {
  dbName: 'bakry_erp_local',
  version: 4,
  stores: ['customers','guarantors','suppliers','products','units','sales','installments','transactions','supplier_dues','audit_logs','branches','defaults','traffic','notifications','collection_notes'],
  db: null,
  makeCloudLocalId() {
    // IndexedDB uses numeric primary keys in this legacy app. Random 52-bit IDs prevent
    // different devices from assigning the same local primary key to unrelated new rows.
    const bytes = new Uint32Array(2); crypto.getRandomValues(bytes);
    return (bytes[0] & 0x000fffff) * 4294967296 + bytes[1] + 1;
  },
  init() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('هذا المتصفح لا يدعم التخزين المحلي IndexedDB.'));
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        this.stores.forEach(name => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        });
        if (!db.objectStoreNames.contains('cloud_meta')) db.createObjectStore('cloud_meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('cloud_outbox')) db.createObjectStore('cloud_outbox', { keyPath: 'operation_uuid' });
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
  _systemStore(name, mode='readonly') {
    if (!this.db || !['cloud_meta','cloud_outbox'].includes(name)) throw new Error('مخزن النظام غير متاح');
    return this.db.transaction(name, mode).objectStore(name);
  },
  getMeta(key) { return new Promise((resolve,reject)=>{ let r; try { r=this._systemStore('cloud_meta').get(key); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result?.value ?? null); r.onerror=()=>reject(r.error); }); },
  putMeta(key,value) { return new Promise((resolve,reject)=>{ let r; try { r=this._systemStore('cloud_meta','readwrite').put({key,value}); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(true); r.onerror=()=>reject(r.error); }); },
  getOutbox() { return new Promise((resolve,reject)=>{ let r; try { r=this._systemStore('cloud_outbox').getAll(); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result||[]); r.onerror=()=>reject(r.error); }); },
  putOutbox(operation) { return new Promise((resolve,reject)=>{ let r; try { r=this._systemStore('cloud_outbox','readwrite').put(operation); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(true); r.onerror=()=>reject(r.error); }); },
  deleteOutbox(operationUuid) { return new Promise((resolve,reject)=>{ let r; try { r=this._systemStore('cloud_outbox','readwrite').delete(operationUuid); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(true); r.onerror=()=>reject(r.error); }); },
  rawPut(name,item) { return new Promise((resolve,reject)=>{ let r; try { r=this._store(name,'readwrite').put({...item,id:Number(item.id)}); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); },
  rawDelete(name,id) { return new Promise((resolve,reject)=>{ let r; try { r=this._store(name,'readwrite').delete(Number(id)); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(true); r.onerror=()=>reject(r.error); }); },
  getAll(name) { return new Promise((resolve,reject)=>{ let r; try { r=this._store(name).getAll(); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result||[]); r.onerror=()=>reject(r.error); }); },
  // Read several stores in one readonly transaction so every screen uses one consistent IndexedDB snapshot.
  getSnapshot(names) {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('التخزين المحلي لم يبدأ بعد')); return; }
      const unique = [...new Set(names || [])];
      if (!unique.length || unique.some(name => !this.stores.includes(name))) { reject(new Error('قائمة جداول غير صالحة لقراءة اللقطة')); return; }
      let tx; const snapshot = {};
      try {
        tx = this.db.transaction(unique, 'readonly');
        unique.forEach(name => {
          const request = tx.objectStore(name).getAll();
          request.onsuccess = () => { snapshot[name] = request.result || []; };
        });
      } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(snapshot);
      tx.onerror = () => reject(tx.error || new Error('فشلت قراءة لقطة البيانات'));
      tx.onabort = () => reject(tx.error || new Error('تم إلغاء قراءة لقطة البيانات'));
    });
  },
  getById(name,id) { return new Promise((resolve,reject)=>{ let r; try { r=this._store(name).get(Number(id)); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>reject(r.error); }); },
  add(name,item) { return new Promise((resolve,reject)=>{ let r; try { const data={...item}; if (window.CloudSync?.isActive()) { data._cloudUuid ||= crypto.randomUUID(); data._cloudRevision = Number(data._cloudRevision)||0; if(data.id===undefined||data.id===null||data.id==='') data.id=this.makeCloudLocalId(); } if(data.id===undefined||data.id===null||data.id==='') delete data.id; r=this._store(name,'readwrite').add(data); } catch(e){reject(e);return;} r.onsuccess=async()=>{ try { if(window.CloudSync?.isActive()) await window.CloudSync.enqueue(name,'put',{...data,id:r.result}); resolve(r.result); } catch(e){ console.error('تعذر وضع العملية في طابور السحابة:',e); resolve(r.result); } }; r.onerror=()=>reject(r.error||new Error('فشل الحفظ المحلي')); }); },
  update(name,item) { return new Promise((resolve,reject)=>{ let r; const data={...item}; try { if(item.id===undefined||item.id===null) throw new Error('معرّف السجل غير موجود'); data.id=Number(item.id); if(window.CloudSync?.isActive()){ data._cloudUuid ||= crypto.randomUUID(); data._cloudRevision=Number(data._cloudRevision)||0; } r=this._store(name,'readwrite').put(data); } catch(e){reject(e);return;} r.onsuccess=async()=>{ try { if(window.CloudSync?.isActive()) await window.CloudSync.enqueue(name,'put',data); resolve(r.result); } catch(e){ console.error('تعذر وضع التحديث في طابور السحابة:',e); resolve(r.result); } }; r.onerror=()=>reject(r.error||new Error('فشل التحديث المحلي')); }); },
  updateBatch(name,items) { return new Promise((resolve,reject)=>{ let tx; const saved=[]; try { tx=this.db.transaction(name,'readwrite'); const st=tx.objectStore(name); (items||[]).forEach(item=>{ if(item.id!==undefined&&item.id!==null) { const data={...item,id:Number(item.id)}; if(window.CloudSync?.isActive()){ data._cloudUuid ||= crypto.randomUUID(); data._cloudRevision=Number(data._cloudRevision)||0; } saved.push(data); st.put(data); } }); } catch(e){reject(e);return;} tx.oncomplete=async()=>{ try { if(window.CloudSync?.isActive()) for(const item of saved) await window.CloudSync.enqueue(name,'put',item); resolve(true); } catch(e){ console.error('تعذر وضع تحديثات الدفعة في طابور السحابة:',e); resolve(true); } }; tx.onerror=()=>reject(tx.error||new Error('فشل تحديث البيانات')); tx.onabort=()=>reject(tx.error||new Error('تم إلغاء تحديث البيانات')); }); },
  delete(name,id) { return new Promise(async(resolve,reject)=>{ let r; let prior=null; try { if(window.CloudSync?.isActive()) prior=await this.getById(name,id); r=this._store(name,'readwrite').delete(Number(id)); }catch(e){reject(e);return;} r.onsuccess=async()=>{ try { if(window.CloudSync?.isActive()&&prior) await window.CloudSync.enqueue(name,'delete',prior); resolve(true); } catch(e){ console.error('تعذر وضع الحذف في طابور السحابة:',e); resolve(true); } }; r.onerror=()=>reject(r.error); }); },
  clearAll() {
    return new Promise((resolve,reject)=>{
      if (!this.db) { reject(new Error('التخزين المحلي لم يبدأ بعد')); return; }
      let tx;
      try {
        tx = this.db.transaction([...this.stores, 'cloud_meta', 'cloud_outbox'], 'readwrite');
        [...this.stores, 'cloud_meta', 'cloud_outbox'].forEach(name => tx.objectStore(name).clear());
      } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('فشل مسح قاعدة البيانات المحلية.'));
      tx.onabort = () => reject(tx.error || new Error('تم إلغاء مسح قاعدة البيانات المحلية.'));
    });
  },
  async generateNextCode(name,prefix) { const rows=await this.getAll(name); let max=1000; rows.forEach(x=>{const m=String(x.code||'').match(/-(\d+)$/);if(m)max=Math.max(max,Number(m[1]));}); return `${prefix}-${max+1}`; },
  async generateNextInvoiceNo() { const rows=await this.getAll('sales'); let max=1000; rows.forEach(x=>{const m=String(x.invoiceNo||'').match(/-(\d+)$/);if(m)max=Math.max(max,Number(m[1]));}); return `INV-${max+1}`; },
  async generateNextTxCode() { return this.generateNextCode('transactions','TX'); },
  async checkAndSeedData() { return true; }
};
