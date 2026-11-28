/* معرض البكري ERP — resilient IndexedDB adapter with local-first cloud outbox */
const MotoDB = {
  dbName: 'bakry_erp_local',
  version: 5,
  stores: ['customers','guarantors','suppliers','products','units','sales','installments','transactions','supplier_dues','audit_logs','branches','defaults','traffic','notifications','collection_notes'],
  db: null,
  initPromise: null,
  makeCloudLocalId() {
    const bytes = new Uint32Array(2);
    crypto.getRandomValues(bytes);
    return (bytes[0] & 0x000fffff) * 4294967296 + bytes[1] + 1;
  },
  makeRecordUuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  },
  init() {
    if (this.db && this.db.objectStoreNames && this.db.objectStoreNames.contains('cloud_outbox')) return Promise.resolve(true);
    if (this.initPromise) return this.initPromise;
    this.initPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('هذا المتصفح لا يدعم التخزين المحلي IndexedDB.')); return; }
      let request;
      try { request = window.indexedDB.open(this.dbName, this.version); }
      catch (error) { reject(error); return; }
      let settled = false;
      const finishError = error => { if (settled) return; settled = true; this.initPromise = null; reject(error); };
      request.onupgradeneeded = () => {
        const db = request.result;
        this.stores.forEach(name => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        });
        if (!db.objectStoreNames.contains('cloud_meta')) db.createObjectStore('cloud_meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('cloud_outbox')) db.createObjectStore('cloud_outbox', { keyPath: 'operation_uuid' });
      };
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true;
        this.db = request.result;
        this.db.onversionchange = () => { try { this.db?.close(); } finally { this.db = null; this.initPromise = null; } };
        this.db.onclose = () => { this.db = null; this.initPromise = null; };
        resolve(true);
      };
      request.onerror = () => finishError(request.error || new Error('تعذر فتح قاعدة البيانات المحلية.'));
      request.onblocked = () => {
        console.warn('قاعدة البيانات المحلية تنتظر إغلاق تبويب أقدم.');
        // Do not leave the startup promise pending forever on mobile browsers.
        setTimeout(() => {
          if (!settled) finishError(new Error('قاعدة البيانات المحلية مشغولة في تبويب آخر. أغلق النسخ القديمة من الموقع ثم أعد المحاولة.'));
        }, 8000);
      };
    });
    return this.initPromise;
  },
  async ensureReady() {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('تعذر تشغيل قاعدة البيانات المحلية. أعد تحميل الصفحة وحاول مرة أخرى.');
    return this.db;
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
  async getMeta(key) { await this.ensureReady(); return new Promise((resolve,reject)=>{ let r; try { r=this._systemStore('cloud_meta').get(key); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result?.value ?? null); r.onerror=()=>reject(r.error); }); },
  async putMeta(key,value) { await this.ensureReady(); return new Promise((resolve,reject)=>{ let r; try { r=this._systemStore('cloud_meta','readwrite').put({key,value}); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(true); r.onerror=()=>reject(r.error); }); },
  async getOutbox() { await this.ensureReady(); return new Promise((resolve,reject)=>{ let r; try { r=this._systemStore('cloud_outbox').getAll(); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result||[]); r.onerror=()=>reject(r.error); }); },
  async putOutbox(operation) { await this.ensureReady(); return new Promise((resolve,reject)=>{ let r; try { r=this._systemStore('cloud_outbox','readwrite').put(operation); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(true); r.onerror=()=>reject(r.error); }); },
  async deleteOutbox(operationUuid) { await this.ensureReady(); return new Promise((resolve,reject)=>{ let r; try { r=this._systemStore('cloud_outbox','readwrite').delete(operationUuid); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(true); r.onerror=()=>reject(r.error); }); },
  async rawPut(name,item) { await this.ensureReady(); return new Promise((resolve,reject)=>{ let r; try { r=this._store(name,'readwrite').put({...item,id:Number(item.id)}); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); },
  async rawDelete(name,id) { await this.ensureReady(); return new Promise((resolve,reject)=>{ let r; try { r=this._store(name,'readwrite').delete(Number(id)); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(true); r.onerror=()=>reject(r.error); }); },
  async getAll(name) { await this.ensureReady(); return new Promise((resolve,reject)=>{ let r; try { r=this._store(name).getAll(); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result||[]); r.onerror=()=>reject(r.error); }); },
  async getSnapshot(names) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const unique = [...new Set(names || [])];
      if (!unique.length || unique.some(name => !this.stores.includes(name))) { reject(new Error('قائمة جداول غير صالحة لقراءة اللقطة')); return; }
      let tx; const snapshot = {};
      try { tx = this.db.transaction(unique, 'readonly'); unique.forEach(name => { const request = tx.objectStore(name).getAll(); request.onsuccess = () => { snapshot[name] = request.result || []; }; }); }
      catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(snapshot);
      tx.onerror = () => reject(tx.error || new Error('فشلت قراءة لقطة البيانات'));
      tx.onabort = () => reject(tx.error || new Error('تم إلغاء قراءة لقطة البيانات'));
    });
  },
  async getById(name,id) { await this.ensureReady(); return new Promise((resolve,reject)=>{ let r; try { r=this._store(name).get(Number(id)); } catch(e){reject(e);return;} r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>reject(r.error); }); },
  async _queueLocalChange(name,action,row) {
    if (!window.CloudSync || !row) return;
    try { await window.CloudSync.enqueue(name,action,row); }
    catch (error) { console.error('تعذر حفظ تغيير محلي في طابور المزامنة:', error); throw error; }
  },
  async add(name,item) {
    await this.ensureReady();
    const data={...item};
    data._cloudUuid ||= this.makeRecordUuid();
    data._cloudRevision = Number(data._cloudRevision)||0;
    if(data.id===undefined||data.id===null||data.id==='') data.id=this.makeCloudLocalId();
    return new Promise((resolve,reject)=>{
      let r; try { r=this._store(name,'readwrite').add(data); } catch(e){reject(e);return;}
      r.onsuccess=async()=>{ const id=r.result; try { await this._queueLocalChange(name,'put',{...data,id}); resolve(id); } catch(error) { reject(error); } };
      r.onerror=()=>reject(r.error||new Error('فشل الحفظ المحلي'));
    });
  },
  async update(name,item) {
    await this.ensureReady();
    const data={...item};
    if(item.id===undefined||item.id===null) throw new Error('معرّف السجل غير موجود');
    data.id=Number(item.id); data._cloudUuid ||= this.makeRecordUuid(); data._cloudRevision=Number(data._cloudRevision)||0;
    return new Promise((resolve,reject)=>{
      let r; try { r=this._store(name,'readwrite').put(data); } catch(e){reject(e);return;}
      r.onsuccess=async()=>{ try { await this._queueLocalChange(name,'put',data); resolve(r.result); } catch(error) { reject(error); } };
      r.onerror=()=>reject(r.error||new Error('فشل التحديث المحلي'));
    });
  },
  async updateBatch(name,items) {
    await this.ensureReady();
    return new Promise((resolve,reject)=>{
      let tx; const saved=[];
      try {
        tx=this.db.transaction(name,'readwrite'); const st=tx.objectStore(name);
        (items||[]).forEach(item=>{ if(item.id!==undefined&&item.id!==null){const data={...item,id:Number(item.id)};data._cloudUuid ||= this.makeRecordUuid();data._cloudRevision=Number(data._cloudRevision)||0;saved.push(data);st.put(data);} });
      } catch(e){reject(e);return;}
      tx.oncomplete=async()=>{ try { for(const item of saved) await this._queueLocalChange(name,'put',item); resolve(true); } catch(e){reject(e);} };
      tx.onerror=()=>reject(tx.error||new Error('فشل تحديث البيانات'));
      tx.onabort=()=>reject(tx.error||new Error('تم إلغاء تحديث البيانات'));
    });
  },
  async delete(name,id) {
    await this.ensureReady();
    const prior=await this.getById(name,id);
    if (prior) { prior._cloudUuid ||= this.makeRecordUuid(); prior._cloudRevision=Number(prior._cloudRevision)||0; }
    return new Promise((resolve,reject)=>{
      let r; try { r=this._store(name,'readwrite').delete(Number(id)); } catch(e){reject(e);return;}
      r.onsuccess=async()=>{ try { if(prior) await this._queueLocalChange(name,'delete',prior); resolve(true); } catch(error){ reject(error); } };
      r.onerror=()=>reject(r.error);
    });
  },
  async clearAll() {
    await this.ensureReady();
    return new Promise((resolve,reject)=>{
      let tx;
      try { tx=this.db.transaction([...this.stores,'cloud_meta','cloud_outbox'],'readwrite'); [...this.stores,'cloud_meta','cloud_outbox'].forEach(name=>tx.objectStore(name).clear()); }
      catch(error){reject(error);return;}
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('فشل مسح قاعدة البيانات المحلية.'));
      tx.onabort=()=>reject(tx.error||new Error('تم إلغاء مسح قاعدة البيانات المحلية.'));
    });
  },
  async generateNextCode(name,prefix) { const rows=await this.getAll(name); let max=1000; rows.forEach(x=>{const m=String(x.code||'').match(/-(\d+)$/);if(m)max=Math.max(max,Number(m[1]));}); return `${prefix}-${max+1}`; },
  async generateNextInvoiceNo() { const rows=await this.getAll('sales'); let max=1000; rows.forEach(x=>{const m=String(x.invoiceNo||'').match(/-(\d+)$/);if(m)max=Math.max(max,Number(m[1]));}); return `INV-${max+1}`; },
  async generateNextTxCode() { return this.generateNextCode('transactions','TX'); },
  async checkAndSeedData() { await this.ensureReady(); return true; }
};
