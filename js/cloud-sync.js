/* Bakry ERP cloud client: tenant-scoped sync with durable outbox and optimistic concurrency. */
(() => {
  const STORES = ['customers','guarantors','suppliers','products','units','sales','installments','transactions','supplier_dues','audit_logs','branches','defaults','traffic','notifications','collection_notes'];
  const READABLE = {
    admin: STORES,
    accounting: STORES,
    viewer: STORES,
    sales: ['customers','guarantors','products','units','sales','installments','traffic','defaults','notifications']
  };
  const uuid = () => crypto.randomUUID();
  const stripMeta = row => { const copy={...row}; delete copy._cloudUuid; delete copy._cloudRevision; return copy; };
  const CloudSync = {
    active:false, apiBase:'', token:'', user:null, tenant:null, timer:null, running:false, bootstrapping:false, needsSync:false, inFlight:new Set(), lastError:'', lastSyncedAt:null,
    isActive(){ return this.active && Boolean(this.token && this.apiBase); },
    configure({apiBase,token,user,tenant}) { this.apiBase=this.normalizeBase(apiBase); this.token=token; this.user=user||null; this.tenant=tenant||null; this.active=true; },
    normalizeBase(value) {
      let u; try { u=new URL(String(value||'').trim()); } catch { throw new Error('رابط السيرفر غير صحيح.'); }
      const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
      if(u.protocol!=='https:' && !(local&&u.protocol==='http:')) throw new Error('يجب استخدام HTTPS مع السيرفر الخارجي.');
      u.hash='';u.search='';u.pathname=u.pathname.replace(/\/+$/,'').replace(/\/api$/i,'');
      return u.origin+u.pathname;
    },
    async request(path,options={}) {
      const response=await fetch(`${this.apiBase}${path}`,{cache:'no-store',credentials:'omit',...options,headers:{...(options.headers||{}),'Authorization':`Bearer ${this.token}`}});
      const body=await response.json().catch(()=>({}));
      if(!response.ok){
        const map={tenant_unauthorized:'انتهت جلسة السيرفر؛ سجّل الدخول مرة أخرى.',license_inactive:'الاشتراك غير نشط أو موقوف.',subscription_expired:'انتهى الاشتراك.',subscription_not_started:'لم يبدأ الاشتراك بعد.',subscription_schema_not_migrated:'قاعدة بيانات الاشتراكات لم يتم تجهيزها بعد.',forbidden:'صلاحيات حسابك لا تسمح بهذه العملية.',sync_conflict:'يوجد تعديل متعارض على سجل من جهاز آخر؛ تم إيقاف المزامنة لحماية البيانات.',unknown_store:'جدول غير معروف على السيرفر.'};
        const error=new Error(map[body.error]||body.error||`فشل اتصال السيرفر (HTTP ${response.status}).`);error.status=response.status;error.payload=body;throw error;
      }
      return body;
    },
    async validateSession(){ return this.request('/api/auth/me'); },
    async enqueue(store,action,row){
      if(!this.isActive()||!STORES.includes(store)) return;
      const recordUuid=row._cloudUuid || uuid();
      const baseRevision=Math.max(0,Number(row._cloudRevision)||0);
      const pending=await MotoDB.getOutbox();
      const sameRecord=pending.filter(op=>op.store_name===store&&op.record_uuid===recordUuid);
      const existing=sameRecord.find(op=>!this.inFlight.has(op.operation_uuid));
      const sending=sameRecord.find(op=>this.inFlight.has(op.operation_uuid));
      // Coalesce not-yet-sent edits. If a prior operation is already being sent,
      // chain this edit onto the next revision rather than reusing its old revision.
      const nextBase=existing?.base_revision ?? (sending ? Number(sending.base_revision)+1 : baseRevision);
      const operation={
        operation_uuid:existing?.operation_uuid||uuid(), record_uuid:recordUuid, store_name:store,
        action, base_revision:nextBase,
        created_at:existing?.created_at||new Date().toISOString(),
        ...(action==='put'?{record_data:stripMeta(row)}:{})
      };
      await MotoDB.putOutbox(operation);
      this.schedule(300);
    },
    schedule(delay=0){ if(!this.isActive()||this.bootstrapping)return; if(this.running){this.needsSync=true;return;} clearTimeout(this._scheduleTimer); this._scheduleTimer=setTimeout(()=>this.sync().catch(e=>this.setError(e.message)),delay); },
    setError(message){ this.lastError=String(message||'تعذر الاتصال'); this.updateBadge(); },
    updateBadge(){
      const badge=document.getElementById('dashboard-cloud-status'); if(!badge)return;
      const label=document.createElement('span');
      label.className='badge-status';
      if(!this.isActive()){ label.textContent='وضع محلي على هذا الجهاز'; badge.replaceChildren(label); return; }
      const pendingCount=window.__bakryPendingCount||0;
      if(this.lastError){ label.classList.add('danger'); label.textContent=`مزامنة متوقفة: ${this.lastError}`; }
      else { label.classList.add('success'); label.textContent=`سحابي متصل${pendingCount?` — ${pendingCount} عملية معلقة`:''}`; }
      badge.replaceChildren(label);
    },
    async fetchAll(){
      const allowed=READABLE[this.user?.role]||[];
      const result={};
      await Promise.all(allowed.map(async store=>{ const data=await this.request(`/api/stores/${encodeURIComponent(store)}`); result[store]=data.items||[]; }));
      return result;
    },
    async bootstrap(){
      if(this.bootstrapping) return;
      this.bootstrapping=true;
      try {
      const localCounts={}; let localTotal=0,legacyTotal=0;
      for(const store of STORES){const rows=await MotoDB.getAll(store);localCounts[store]=rows;localTotal+=rows.length;legacyTotal+=rows.filter(r=>!r._cloudUuid).length;}
      const previousTenant=await MotoDB.getMeta('cloud_tenant_id');
      const hasInitialized=Boolean(await MotoDB.getMeta('cloud_initialized'));
      if(previousTenant && this.tenant?.id && previousTenant!==this.tenant.id && localTotal>0) throw new Error('هذه النسخة تحتوي بيانات لمنشأة أخرى؛ أوقفنا الربط حتى لا تختلط بيانات المنشآت.');
      const remote=await this.fetchAll(); const remoteTotal=Object.values(remote).reduce((n,items)=>n+items.length,0); // Include tombstones: they prove this tenant previously had cloud records.
      if(!hasInitialized && remoteTotal>0 && localTotal>0 && legacyTotal>0) throw new Error('يوجد بيانات محلية قديمة وبيانات سحابية معًا. لم ندمج أو نستبدل أي سجل. خذ نسخة احتياطية واطلب مطابقة البيانات قبل أول ربط.');
      if(!hasInitialized && remoteTotal===0 && localTotal>0 && legacyTotal>0){
        if(this.user?.role!=='admin') throw new Error('يلزم تسجيل الدخول بحساب مدير المنشأة لاعتماد نقل البيانات المحلية القديمة لأول مرة.');
        const accepted=await BakryDialogs.confirm(`وجدنا ${localTotal} سجلًا محليًا على هذا الجهاز ولا توجد سجلات على السيرفر. هل هذا هو الجهاز الذي يحتوي النسخة الأساسية وتوافق على رفع السجلات الحالية إلى السحابة؟ لن يتم حذف البيانات المحلية.`);
        if(!accepted) throw new Error('تم إيقاف الربط السحابي دون تعديل البيانات.');
        for(const store of STORES){
          for(const row of localCounts[store]){
            const tagged={...row,_cloudUuid:row._cloudUuid||uuid(),_cloudRevision:0};
            await MotoDB.rawPut(store,tagged);
            await this.enqueue(store,'put',tagged);
          }
        }
        await this.flushOutbox();
      } else if(!hasInitialized && remoteTotal>0 && legacyTotal===0){
        await this.applyRemote(remote);
      } else if(!hasInitialized && remoteTotal===0 && localTotal===0){
        // New device / new tenant: start from an empty authoritative cloud database.
      } else {
        await this.applyRemote(remote);
      }
      await MotoDB.putMeta('cloud_tenant_id',this.tenant?.id||'');
      await MotoDB.putMeta('cloud_initialized',true);
      await MotoDB.putMeta('cloud_last_snapshot_at',new Date().toISOString());
      this.lastSyncedAt=new Date(); this.lastError=''; this.updateBadge();
      } finally {
        this.bootstrapping=false;
        const queued=await MotoDB.getOutbox().catch(()=>[]);
        if(queued.length) this.schedule(300);
      }
    },
    async applyRemote(remote){
      const outbox=await MotoDB.getOutbox();
      const pending=new Set(outbox.map(op=>`${op.store_name}:${op.record_uuid}`));
      // A suddenly empty API response must never wipe a populated local store.
      // Tombstones are returned as items, so an actually-cleared/empty server is distinguishable.
      for(const [store,items] of Object.entries(remote)){
        if(!STORES.includes(store))continue;
        if(items.length===0){
          const localRows=await MotoDB.getAll(store);
          const confirmed=localRows.filter(row=>row._cloudUuid && Number(row._cloudRevision)>0 && !pending.has(`${store}:${row._cloudUuid}`));
          if(confirmed.length) throw new Error(`حماية البيانات: السيرفر أعاد جدول ${store} فارغًا رغم وجود ${confirmed.length} سجل محلي متزامن. لم نحذف أي سجل؛ راجع اتصال وقاعدة بيانات السيرفر.`);
        }
      }
      for(const [store,items] of Object.entries(remote)){
        if(!STORES.includes(store))continue;
        const activeUuids=new Set(items.map(x=>x.record_uuid));
        const byId=new Map();
        for(const remoteItem of items){
          const data=remoteItem.record_data||{}; const id=Number(data.id);
          if(!Number.isFinite(id)||id<=0)continue;
          byId.set(id,remoteItem);
          if(pending.has(`${store}:${remoteItem.record_uuid}`))continue;
          if(remoteItem.deleted_at){ await MotoDB.rawDelete(store,id).catch(()=>{}); continue; }
          await MotoDB.rawPut(store,{...data,id,_cloudUuid:remoteItem.record_uuid,_cloudRevision:Number(remoteItem.revision)||1});
        }
        const local=await MotoDB.getAll(store);
        for(const row of local){
          if(!row._cloudUuid) continue;
          if(pending.has(`${store}:${row._cloudUuid}`)) continue;
          if(!activeUuids.has(row._cloudUuid)) {
            if(Number(row._cloudRevision||0)===0){
              // Recover an unsent row if the browser closed between local save and outbox write.
              await this.enqueue(store,'put',row);
              continue;
            }
            await MotoDB.rawDelete(store,row.id);
          }
        }
      }
    },
    async flushOutbox(){
      const operations=(await MotoDB.getOutbox()).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
      for(let offset=0;offset<operations.length;offset+=200){
        const chunk=operations.slice(offset,offset+200);
        chunk.forEach(op=>this.inFlight.add(op.operation_uuid));
        try{
          await this.request('/api/sync/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operations:chunk})});
          for(const op of chunk){
            await MotoDB.deleteOutbox(op.operation_uuid);
            if(op.action==='put'){
              const id=Number(op.record_data?.id);
              if(Number.isFinite(id)&&id>0){
                const current=await MotoDB.getById(op.store_name,id);
                if(current&&current._cloudUuid===op.record_uuid){current._cloudRevision=op.base_revision+1;await MotoDB.rawPut(op.store_name,current);}
              }
            }
          }
        } finally { chunk.forEach(op=>this.inFlight.delete(op.operation_uuid)); }
      }
    },
    async sync(){
      if(!this.isActive()||!navigator.onLine)return false;
      if(this.running){this.needsSync=true;return false;}
      const execute=()=>this._syncExclusive();
      // Serialize sync across tabs on the same browser profile. Separate devices still
      // coordinate through server revisions and operation UUIDs.
      if(navigator.locks?.request){
        return navigator.locks.request('bakry-erp-cloud-sync',{mode:'exclusive',ifAvailable:true},async lock=>{
          if(!lock){this.schedule(1200);return false;}
          return execute();
        });
      }
      return execute();
    },
    async _syncExclusive(){
      if(this.running){this.needsSync=true;return false;}
      this.running=true; this.needsSync=false;
      try{
        await this.flushOutbox();
        const remote=await this.fetchAll();
        await this.applyRemote(remote);
        await MotoDB.putMeta('cloud_last_snapshot_at',new Date().toISOString());
        this.lastSyncedAt=new Date(); this.lastError='';
        const remaining=await MotoDB.getOutbox(); window.__bakryPendingCount=remaining.length;
        this.updateBadge(); return true;
      }catch(e){ this.setError(e.message); throw e; }
      finally {
        this.running=false;
        const remaining=await MotoDB.getOutbox().catch(()=>[]);
        window.__bakryPendingCount=remaining.length;
        if(this.isActive() && this.needsSync) { this.needsSync=false; this.schedule(500); }
      }
    },
    startPolling(){
      clearInterval(this.timer);
      this.timer=setInterval(()=>this.sync().catch(()=>{}),30000);
      window.addEventListener('online',this._onlineHandler ||= (()=>this.sync().catch(()=>{})));
      window.addEventListener('beforeunload',()=>clearInterval(this.timer),{once:true});
    },
    stop(){ this.active=false;this.token='';clearInterval(this.timer);clearTimeout(this._scheduleTimer);this.updateBadge(); }
  };
  window.CloudSync=CloudSync;
})();
