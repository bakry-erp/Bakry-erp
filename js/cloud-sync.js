/* Bakry ERP cloud client: tenant-scoped sync with durable outbox and optimistic concurrency. */
(() => {
  const STORES = ['customers','guarantors','suppliers','products','units','sales','installments','transactions','supplier_dues','audit_logs','branches','defaults','traffic','notifications','collection_notes'];
  const READABLE = {
    admin: STORES,
    accounting: STORES,
    viewer: STORES,
    sales: ['customers','guarantors','products','units','sales','installments','traffic','defaults','notifications']
  };
  const WRITABLE = {
    admin: STORES,
    accounting: ['customers','guarantors','suppliers','products','units','sales','installments','transactions','supplier_dues','audit_logs','branches','defaults','traffic','notifications','collection_notes'],
    sales: ['customers','guarantors','products','units','sales','installments','traffic','defaults','notifications'],
    viewer: []
  };
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  const stripMeta = row => { const copy={...row}; delete copy._cloudUuid; delete copy._cloudRevision; return copy; };
  const CloudSync = {
    DEFAULT_API_BASE:'https://bakry-erp.onrender.com', VERSION:'1.4.2', active:false, apiBase:'', token:'', user:null, tenant:null, timer:null, running:false, bootstrapping:false, needsSync:false, inFlight:new Set(), lastError:'', lastSyncedAt:null,
    isActive(){ return this.active && Boolean(this.token && this.apiBase); },
    getConfiguredApiBase(){
      const saved=localStorage.getItem('bakry_api_base_url')||'';
      return (!saved || /example\.com/i.test(saved)) ? this.DEFAULT_API_BASE : saved;
    },
    configure({apiBase,token,user,tenant}) { this.apiBase=this.normalizeBase(apiBase); this.token=token; this.user=user||null; this.tenant=tenant||null; this.active=true; },
    normalizeBase(value) {
      let u; try { u=new URL(String(value||'').trim()); } catch { throw new Error('رابط السيرفر غير صحيح.'); }
      const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
      if(u.protocol!=='https:' && !(local&&u.protocol==='http:')) throw new Error('يجب استخدام HTTPS مع السيرفر الخارجي.');
      u.hash='';u.search='';
      const normalizedPath=u.pathname.replace(/\/+$/,'').replace(/\/api$/i,'');
      return u.origin+normalizedPath;
    },
    async request(path,options={}) {
      const controller=typeof AbortController!=='undefined'?new AbortController():null;
      const timeoutMs=Number(options.timeoutMs)||65000;
      const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
      const requestOptions={...options};
      delete requestOptions.timeoutMs;
      let response;
      try {
        response=await fetch(`${this.apiBase}${path}`,{cache:'no-store',credentials:'omit',...requestOptions,...(controller?{signal:controller.signal}:{}),headers:{...(requestOptions.headers||{}),'Authorization':`Bearer ${this.token}`}});
      } catch(error) {
        if(error?.name==='AbortError') throw new Error(`انتهت مهلة طلب السحابة (${path}) بعد ${Math.round(timeoutMs/1000)} ثانية. أعد المحاولة؛ البيانات المحلية لم تُحذف.`);
        if(error instanceof TypeError) throw new Error(`تعذر الاتصال بالخادم أثناء الطلب ${path}. تحقق من اتصال Render وCORS.`);
        throw error;
      } finally { if(timer) clearTimeout(timer); }
      const body=await response.json().catch(()=>({}));
      if(!response.ok){
        const requestId=String(body.request_id || response.headers.get('X-Request-Id') || '');
        const failedPath=String(path || '').slice(0,120);
        const map={internal_error:`حدث خطأ داخلي في الخادم أثناء الطلب ${failedPath} (HTTP ${response.status}). رقم المتابعة: ${requestId || 'غير متاح'}. لم يتم حذف بياناتك؛ أرسل رقم المتابعة لفحص سجل Render.`,origin_not_allowed:'الخادم رفض الطلب بسبب إعداد CORS. تأكد من السماح لأصل https://bakry-erp.github.io في Render.',tenant_unauthorized:'انتهت جلسة السيرفر؛ سجّل الدخول مرة أخرى.',license_inactive:'الاشتراك غير نشط أو موقوف.',subscription_expired:'انتهى الاشتراك.',subscription_not_started:'لم يبدأ الاشتراك بعد.',subscription_schema_not_migrated:'قاعدة بيانات الاشتراكات لم يتم تجهيزها بعد.',forbidden:'صلاحيات حسابك لا تسمح بهذه العملية.',sync_conflict:'يوجد تعديل متعارض على سجل من جهاز آخر؛ تم إيقاف المزامنة لحماية البيانات.',unknown_store:'جدول غير معروف على السيرفر.',engine_not_enabled_yet:'هذا المحرك محفوظ للتفعيل مستقبلًا؛ PostgreSQL ما زال محرك التشغيل الفعلي.',s3_backup_config_incomplete:'أكمل رابط التخزين واسم الحاوية ومفتاح الوصول والمفتاح السري قبل تفعيل النسخ السحابي.',cloud_backup_disabled:'النسخ السحابي غير مفعّل.',backup_too_large:'حجم النسخة الاحتياطية تجاوز الحد المسموح (25 ميجابايت).',webhook_url_must_be_public_https:'يجب أن يكون رابط الاستقبال HTTPS عامًا وليس عنوانًا محليًا أو خاصًا.',webhook_host_unresolved:'تعذر التحقق من عنوان خادم الاستقبال.',s3_credentials_missing:'بيانات دخول التخزين S3 غير مكتملة.',s3_endpoint_invalid:'رابط S3 غير صالح. استخدم عنوان HTTPS أساسيًا بدون مسار إضافي.',s3_bucket_invalid:'اسم حاوية S3 غير صالح.',webhook_url_invalid:'رابط Webhook غير صالح. أدخل عنوان HTTPS صحيحًا.',backup_provider_invalid:'نوع النسخ السحابي غير مدعوم.',settings_encryption_key_unavailable:'مفتاح تشفير الإعدادات غير مضبوط بشكل صحيح (32 حرفًا على الأقل).',backup_upload_timeout:'انتهت مهلة رفع النسخة السحابية. افحص اتصال الخادم وحاول مرة أخرى.',backup_upload_network_error:'تعذر الاتصال بمخزن النسخ السحابي. راجع الرابط وإعدادات التخزين.',backup_upload_failed_400:'رفض مخزن النسخ السحابية الطلب (400). راجع إعدادات الحاوية والمنطقة.',backup_upload_failed_401:'مخزن النسخ السحابي رفض بيانات الاعتماد (401).',backup_upload_failed_403:'لا توجد صلاحية للرفع إلى مخزن النسخ السحابي (403).',backup_upload_failed_404:'لم يتم العثور على الحاوية أو مسار النسخ السحابي (404).'};
        const uploadFailure=/^backup_upload_failed_(\d+)$/.exec(String(body.error||''));
        const fallbackError=uploadFailure?`رفض مخزن النسخ السحابي الطلب (HTTP ${uploadFailure[1]}). راجع صلاحيات الحاوية وإعدادات الوجهة.`:body.error;
        let message=map[body.error]||fallbackError||`فشل اتصال السيرفر أثناء الطلب ${failedPath} (HTTP ${response.status}).`;
        if (response.status >= 500 && body.error !== 'internal_error') {
          message += ` المسار: ${failedPath}. رقم المتابعة: ${requestId || 'غير متاح'}.`;
        }
        const error=new Error(message);
        error.status=response.status;error.payload=body;error.path=failedPath;error.requestId=requestId;throw error;
      }
      return body;
    },
    async validateSession(){ return this.request('/api/auth/me'); },
    async enqueue(store,action,row){
      if(!STORES.includes(store)) return;
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
        record_id:Number(row.id),
        ...(action==='put'?{record_data:stripMeta(row)}:{record_snapshot:stripMeta(row)})
      };
      await MotoDB.putOutbox(operation);
      const latest=await MotoDB.getOutbox().catch(()=>[]);
      window.__bakryPendingCount=latest.length;
      this.updateBadge();
      if(this.isActive()) this.schedule(300);
    },
    schedule(delay=0){ if(!this.isActive()||this.bootstrapping)return; if(this.running){this.needsSync=true;return;} clearTimeout(this._scheduleTimer); this._scheduleTimer=setTimeout(()=>this.sync().catch(e=>this.setError(e.message)),delay); },
    setError(message){ this.lastError=String(message||'تعذر الاتصال'); this.updateBadge(); },
    updateBadge(){
      const badge=document.getElementById('dashboard-cloud-status'); if(!badge)return;
      const label=document.createElement('span');
      label.className='badge-status';
      const pendingCount=window.__bakryPendingCount||0;
      if(!this.isActive()){ label.textContent=`وضع محلي على هذا الجهاز${pendingCount?` — ${pendingCount} تغييرات محفوظة وستُرفع عند الدخول السحابي`:''}`; badge.replaceChildren(label); return; }
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
        await MotoDB.ensureReady();
        const localCounts={}; let localTotal=0,legacyTotal=0;
        for(const store of STORES){const rows=await MotoDB.getAll(store);localCounts[store]=rows;localTotal+=rows.length;legacyTotal+=rows.filter(r=>!r._cloudUuid).length;}
        const previousTenant=await MotoDB.getMeta('cloud_tenant_id');
        if(previousTenant && this.tenant?.id && previousTenant!==this.tenant.id && localTotal>0) throw new Error('هذه النسخة تحتوي بيانات لمنشأة أخرى؛ أوقفنا الربط حتى لا تختلط بيانات المنشآت.');
        let remote=await this.fetchAll();

        // Resolve deletes created from legacy local rows by matching their saved pre-delete snapshot.
        const pendingDeletes=(await MotoDB.getOutbox()).filter(op=>op.action==='delete' && Number(op.base_revision)===0 && Number(op.record_id)>0);
        const deleteConflicts=[];
        for(const op of pendingDeletes){
          const candidates=(remote[op.store_name]||[]).filter(item=>Number(item.record_data?.id)===Number(op.record_id));
          if(!candidates.length) continue;
          const exact=candidates.find(item=>!item.deleted_at && this.stableRecord(item.record_data||{})===this.stableRecord(op.record_snapshot||{}));
          if(!exact){deleteConflicts.push(`${op.store_name}#${op.record_id}`);continue;}
          op.record_uuid=exact.record_uuid;
          op.base_revision=Number(exact.revision)||0;
          await MotoDB.putOutbox(op);
        }
        if(deleteConflicts.length) throw new Error(`لم نرسل بعض عمليات الحذف المحلية بسبب تعارض مع سجلات سحابية مختلفة: ${deleteConflicts.slice(0,8).join('، ')}. احتفظنا بالحذف محليًا ولم نحذف أي سجل من السيرفر.`);

        // Convert pre-v4 local rows into cloud records automatically. Preflight every
        // possible numeric-ID collision first, so no row is tagged/queued if any conflict exists.
        const allowedStores = new Set(READABLE[this.user?.role] || []);
        const adoptPlan=[]; const attachPlan=[]; const conflicts=[];
        for(const store of STORES){
          if(!allowedStores.has(store)) continue;
          const remoteItems=remote[store]||[];
          const remoteById=new Map(); const remoteByUuid=new Map(remoteItems.map(item=>[item.record_uuid,item]));
          for(const item of remoteItems){ const id=Number(item.record_data?.id); if(Number.isFinite(id)&&id>0){ if(remoteById.has(id) && remoteById.get(id).record_uuid!==item.record_uuid) conflicts.push(`${store}#${id} (تكرار رقم على السيرفر)`); else remoteById.set(id,item); } }
          for(const row of localCounts[store]){
            const remoteBySameUuid=row._cloudUuid?remoteByUuid.get(row._cloudUuid):null;
            if(remoteBySameUuid){
              if(Number(remoteBySameUuid.record_data?.id)!==Number(row.id)) conflicts.push(`${store}#${row.id} (معرّف سحابي مختلف)`);
              continue;
            }
            const remoteItem=remoteById.get(Number(row.id));
            if(remoteItem){
              if(!row._cloudUuid && !remoteItem.deleted_at && this.stableRecord(remoteItem.record_data||{})===this.stableRecord(row)) attachPlan.push({store,row,remoteItem});
              else conflicts.push(`${store}#${row.id}`);
              continue;
            }
            if(!row._cloudUuid) adoptPlan.push({store,row});
          }
        }
        if(conflicts.length){
          throw new Error(`أوقفنا النقل التلقائي لحماية البيانات؛ توجد أرقام سجلات متعارضة بين التخزين المحلي والسيرفر: ${conflicts.slice(0,8).join('، ')}${conflicts.length>8?'…':''}. لم يتم رفع أو استبدال أي سجل محلي في هذه المرحلة.`);
        }
        for(const {store,row,remoteItem} of attachPlan){
          await MotoDB.rawPut(store,{...row,_cloudUuid:remoteItem.record_uuid,_cloudRevision:Number(remoteItem.revision)||1});
        }
        for(const {store,row} of adoptPlan){
          const tagged={...row,_cloudUuid:uuid(),_cloudRevision:0};
          await MotoDB.rawPut(store,tagged);
          await this.enqueue(store,'put',tagged);
        }
        if(adoptPlan.length){
          if(document.getElementById('login-hint')){
            const hint=document.getElementById('login-hint');hint.style.display='block';hint.textContent=`تم العثور على ${adoptPlan.length} سجل محلي جديد. جارٍ رفع التغييرات إلى السحابة تلقائيًا…`;
          }
          await this.flushOutbox();
          remote=await this.fetchAll();
        }
        if(attachPlan.length) console.info(`Cloud bootstrap: ${attachPlan.length} سجل محلي مطابق تم ربطه بسجلاته السحابية.`);

        // If a user worked locally after the previous cloud session, detect unsent
        // edits by comparing local rows to the last known server revision before pull.
        await this.reconcileLocalChanges(remote);
        const pending=await MotoDB.getOutbox();
        if(pending.length){
          await this.flushOutbox();
          remote=await this.fetchAll();
        }
        await this.applyRemote(remote);
        await MotoDB.putMeta('cloud_tenant_id',this.tenant?.id||'');
        await MotoDB.putMeta('cloud_initialized',true);
        await MotoDB.putMeta('cloud_last_snapshot_at',new Date().toISOString());
        this.lastSyncedAt=new Date(); this.lastError=''; this.updateBadge();
      } finally {
        this.bootstrapping=false;
        const queued=await MotoDB.getOutbox().catch(()=>[]);
        window.__bakryPendingCount=queued.length;
        if(queued.length) this.schedule(300);
      }
    },
    stableRecord(row){
      const sort=(value)=>Array.isArray(value)?value.map(sort):(value&&typeof value==='object'?Object.keys(value).sort().reduce((out,key)=>{if(value[key]!==undefined)out[key]=sort(value[key]);return out;},{}):value);
      return JSON.stringify(sort(stripMeta(row||{})));
    },
    async reconcileLocalChanges(remote){
      const outbox=await MotoDB.getOutbox();
      const pending=new Set(outbox.map(op=>`${op.store_name}:${op.record_uuid}`));
      for(const [store,items] of Object.entries(remote)){
        if(!STORES.includes(store)) continue;
        const remoteByUuid=new Map(items.map(item=>[item.record_uuid,item]));
        const localRows=await MotoDB.getAll(store);
        for(const row of localRows){
          if(!row._cloudUuid || pending.has(`${store}:${row._cloudUuid}`)) continue;
          const server=remoteByUuid.get(row._cloudUuid);
          if(server && Number(server.record_data?.id)!==Number(row.id)) throw new Error(`تعارض معرّف: السجل ${store} له رقم مختلف بين الجهاز والسيرفر. لم ننقل أو نحذف أي بيانات.`);
          if(!server){
            if(Number(row._cloudRevision||0)===0){ await this.enqueue(store,'put',row); continue; }
            throw new Error(`حماية البيانات: السجل ${store} رقم ${row.id} معروف محليًا لكنه غير موجود في استجابة السيرفر. لم نسمح بحذفه أو استبداله.`);
          }
          if(server.deleted_at){
            throw new Error(`تعارض حذف: السجل ${store} رقم ${row.id} محذوف على السيرفر بينما توجد منه نسخة محلية. لم نغير أي نسخة.`);
          }
          const localRevision=Number(row._cloudRevision)||0;
          const serverRevision=Number(server.revision)||0;
          if(localRevision===serverRevision && this.stableRecord(row)!==this.stableRecord(server.record_data||{})){
            await this.enqueue(store,'put',row);
          } else if(localRevision>serverRevision){
            throw new Error(`حماية البيانات: مراجعة السجل المحلي ${store} رقم ${row.id} أحدث من مراجعة السيرفر. أوقفنا المزامنة بدل الكتابة فوق البيانات.`);
          }
        }
      }
    },
    async applyRemote(remote){
      const outbox=await MotoDB.getOutbox();
      const pending=new Set(outbox.map(op=>`${op.store_name}:${op.record_uuid}`));
      // A suddenly empty API response must never wipe a populated local store.
      // Tombstones are returned as items, so an actually-cleared/empty server is distinguishable.
      for(const [store,items] of Object.entries(remote)){
        if(!STORES.includes(store))continue;
        const idOwners=new Map();
        for(const item of items){
          const id=Number(item.record_data?.id);
          if(!Number.isFinite(id)||id<=0) continue;
          const owner=idOwners.get(id);
          if(owner && owner!==item.record_uuid) throw new Error(`حماية البيانات: السيرفر يحتوي سجلين مختلفين بالرقم نفسه في جدول ${store} (${id}). أوقفنا التحديث حتى لا يُستبدل أي سجل.`);
          idOwners.set(id,item.record_uuid);
        }
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
            // A missing row is not proof of deletion. Only an explicit tombstone may delete locally.
            throw new Error(`حماية البيانات: السجل ${store} رقم ${row.id} غير موجود في استجابة السيرفر ولا يوجد سجل حذف صريح. احتفظنا بالبيانات المحلية.`);
          }
        }
      }
    },
    async flushOutbox(){
      const operations=(await MotoDB.getOutbox()).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
      const writable=new Set(WRITABLE[this.user?.role]||[]);
      const blocked=operations.filter(op=>!writable.has(op.store_name));
      if(blocked.length) throw new Error(`توجد ${blocked.length} تغييرات محلية معلقة في جداول لا تسمح صلاحية هذا المستخدم برفعها. سجّل الدخول بحساب مدير المنشأة لمزامنة كل التغييرات.`);
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
