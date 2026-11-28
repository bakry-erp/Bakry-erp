/* معرض البكري ERP — resilient IndexedDB adapter with local-first cloud outbox */
const MotoDB = {
  dbName: 'bakry_erp_local',
  version: 6,
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
    if (this.db && this._isDatabaseUsable()) return Promise.resolve(true);
    if (this.initPromise) return this.initPromise;
    if (!window.indexedDB) return Promise.reject(new Error('هذا المتصفح لا يدعم التخزين المحلي IndexedDB. افتح النظام في Chrome أو متصفح حديث.'));

    let resolveInit, rejectInit;
    const promise = new Promise((resolve, reject) => { resolveInit = resolve; rejectInit = reject; });
    this.initPromise = promise;
    const attemptId = (this._initGeneration = (this._initGeneration || 0) + 1);
    let request = null;
    let settled = false;
    let overallTimer = null;
    let blockedTimer = null;

    const clearTimers = () => {
      if (overallTimer) clearTimeout(overallTimer);
      if (blockedTimer) clearTimeout(blockedTimer);
      overallTimer = blockedTimer = null;
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      clearTimers();
      if (this.initPromise === promise) this.initPromise = null;
      rejectInit(error instanceof Error ? error : new Error(String(error || 'تعذر فتح قاعدة البيانات المحلية.')));
    };
    const ensureTabCoordinator = () => {
      if (this.dbChannel || typeof window.BroadcastChannel !== 'function') return;
      try {
        this.dbChannel = new window.BroadcastChannel('bakry-erp-db-control-v1');
        this.dbChannel.onmessage = event => {
          if (event.data?.type !== 'close-database-for-upgrade' || event.data?.dbName !== this.dbName) return;
          try { this.db?.close(); } catch (_) {}
          this.db = null;
          this.initPromise = null;
          try { this.dbChannel.postMessage({ type: 'database-closed', dbName: this.dbName }); } catch (_) {}
        };
      } catch (error) {
        console.warn('تعذر تشغيل قناة تنسيق تبويبات قاعدة البيانات:', error);
      }
    };

    ensureTabCoordinator();
    overallTimer = setTimeout(() => {
      fail(new Error('انتهت مهلة فتح قاعدة البيانات المحلية. أغلق تبويبات Bakry ERP القديمة ثم أعد تحميل الصفحة. لم يتم حذف أي بيانات.'));
    }, 15000);

    try {
      request = window.indexedDB.open(this.dbName, this.version);
    } catch (error) {
      fail(this._describeOpenError(error));
      return promise;
    }

    request.onupgradeneeded = () => {
      try {
        const db = request.result;
        this.stores.forEach(name => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        });
        if (!db.objectStoreNames.contains('cloud_meta')) db.createObjectStore('cloud_meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('cloud_outbox')) db.createObjectStore('cloud_outbox', { keyPath: 'operation_uuid' });
        if (!db.objectStoreNames.contains('backup_snapshots')) db.createObjectStore('backup_snapshots', { keyPath: 'id', autoIncrement: true });
      } catch (error) {
        fail(new Error('تعذر تجهيز جداول قاعدة البيانات المحلية دون المساس بالسجلات الموجودة: ' + (error.message || error)));
      }
    };
    request.onsuccess = () => {
      const openedDb = request.result;
      if (settled || attemptId !== this._initGeneration) {
        try { openedDb.close(); } catch (_) {}
        return;
      }
      const requiredStores = [...this.stores, 'cloud_meta', 'cloud_outbox', 'backup_snapshots'];
      const missing = requiredStores.filter(name => !openedDb.objectStoreNames.contains(name));
      if (missing.length) {
        try { openedDb.close(); } catch (_) {}
        fail(new Error('قاعدة البيانات المحلية لا تحتوي على بعض الجداول المطلوبة (' + missing.join(', ') + '). لم يتم حذف أو إعادة إنشاء قاعدة البيانات. أغلق التبويبات القديمة وحدّث الصفحة.'));
        return;
      }
      settled = true;
      clearTimers();
      this.db = openedDb;
      this.db.onversionchange = () => {
        try { this.db?.close(); } catch (_) {}
        this.db = null;
        this.initPromise = null;
      };
      this.db.onclose = () => {
        this.db = null;
        this.initPromise = null;
      };
      resolveInit(true);
    };
    request.onerror = () => fail(this._describeOpenError(request.error));
    request.onblocked = () => {
      console.warn('تحديث/فتح قاعدة بيانات Bakry ERP ينتظر إغلاق تبويب أقدم.');
      try { this.dbChannel?.postMessage({ type: 'close-database-for-upgrade', dbName: this.dbName, version: this.version }); } catch (_) {}
      if (!blockedTimer) {
        blockedTimer = setTimeout(() => {
          fail(new Error('قاعدة البيانات المحلية محجوزة بواسطة تبويب قديم مفتوح. أغلق جميع تبويبات Bakry ERP الأخرى، ثم أعد تحميل الصفحة. بياناتك الحالية لم تُحذف.'));
        }, 6000);
      }
    };
    return promise;
  },
  _describeOpenError(error) {
    const name = error?.name || '';
    if (name === 'VersionError') return new Error('إصدار قاعدة البيانات المحلية أحدث من ملفات الصفحة الحالية. حدّث الصفحة وتأكد من عدم فتح نسخة قديمة من Bakry ERP.');
    if (name === 'SecurityError' || name === 'NotAllowedError') return new Error('المتصفح منع التخزين المحلي. افتح الموقع عبر HTTPS وتأكد من السماح ببيانات المواقع.');
    if (name === 'QuotaExceededError') return new Error('مساحة التخزين المحلي المتاحة غير كافية. لم يتم حذف أي بيانات.');
    if (name === 'AbortError') return new Error('أوقف المتصفح فتح قاعدة البيانات المحلية. أغلق التبويبات الأخرى ثم أعد المحاولة.');
    return new Error(error?.message || 'تعذر فتح قاعدة البيانات المحلية. أغلق التبويبات القديمة ثم أعد المحاولة.');
  },
  _isDatabaseUsable() {
    if (!this.db) return false;
    try {
      const required = [...this.stores, 'cloud_meta', 'cloud_outbox'];
      if (required.some(name => !this.db.objectStoreNames.contains(name))) return false;
      this.db.transaction('cloud_meta', 'readonly');
      return true;
    } catch (_) {
      this.db = null;
      this.initPromise = null;
      return false;
    }
  },
  async ensureReady() {
    if (!this._isDatabaseUsable()) await this.init();
    if (!this._isDatabaseUsable()) throw new Error('تعذر تشغيل قاعدة البيانات المحلية. أغلق التبويبات القديمة وأعد تحميل الصفحة.');
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
  async addBackupSnapshot(snapshot) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      let request;
      try { request = this.db.transaction('backup_snapshots', 'readwrite').objectStore('backup_snapshots').add({ created_at: new Date().toISOString(), snapshot }); }
      catch (error) { reject(error); return; }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('تعذر حفظ النسخة المحلية'));
    });
  },
  async getBackupSnapshots() {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      let request;
      try { request = this.db.transaction('backup_snapshots', 'readonly').objectStore('backup_snapshots').getAll(); }
      catch (error) { reject(error); return; }
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('تعذر قراءة النسخ المحلية'));
    });
  },
  async pruneBackupSnapshots(keep = 5) {
    await this.ensureReady();
    const rows = await this.getBackupSnapshots();
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const remove = rows.slice(Math.max(1, Number(keep) || 5));
    if (!remove.length) return 0;
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = this.db.transaction('backup_snapshots', 'readwrite'); remove.forEach(row => tx.objectStore('backup_snapshots').delete(row.id)); }
      catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(remove.length);
      tx.onerror = () => reject(tx.error || new Error('تعذر تنظيف النسخ القديمة'));
      tx.onabort = () => reject(tx.error || new Error('تم إلغاء تنظيف النسخ القديمة'));
    });
  },
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
