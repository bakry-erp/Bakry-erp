(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { apiBase: '', token: '', tenants: [], codes: [] };
  const DURATION_LABELS = { month_1:'شهر', month_2:'شهران', month_4:'4 أشهر', year_1:'سنة', lifetime:'مدى الحياة' };
  const STATUS_LABELS = { active:'نشط', suspended:'موقوف', expired:'منتهي', renewed:'مُجدد', unused:'غير مستخدم', activated:'تم التفعيل', cancelled:'ملغي' };
  const escapeText = value => String(value ?? '');
  const formatDate = value => value ? new Date(value).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}) : 'بدون تاريخ انتهاء';
  const message = (target, text, kind='error') => { const el=$(target); el.textContent=text||''; el.className='message '+(text?kind:''); };
  const API_TIMEOUT_MS = 65000;
  function normalizeBase(value){ let url; try{url=new URL(String(value||'').trim());}catch{throw new Error('رابط API غير صحيح.');} const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname); if(url.protocol!=='https:'&&!(local&&url.protocol==='http:')) throw new Error('استخدم HTTPS مع الخادم الخارجي.'); url.hash='';url.search='';url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/api$/i,'');return url.origin+url.pathname; }
  async function fetchApi(url, options={}){
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      return await fetch(url, { mode:'cors', credentials:'omit', cache:'no-store', ...options, signal:controller.signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('لم يستجب خادم Render خلال 65 ثانية. قد تكون الخدمة في وضع السكون أو تواجه بطئًا؛ جرّب فتح رابط /api/health ثم أعد المحاولة.');
      if (error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(error?.message || ''))) {
        throw new Error('تعذر الاتصال بخادم Render. قد يكون الخادم متوقفًا أو إعداد CORS في Render لا يسمح بأصل https://bakry-erp.github.io. افتح https://bakry-erp.onrender.com/api/health في تبويب جديد للتأكد من استجابة الخادم.');
      }
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function diagnoseOwnerLogin404(apiBase){
    try {
      const healthResponse = await fetchApi(`${apiBase}/api/health`, { method:'GET', headers:{'Accept':'application/json'} });
      const health = await healthResponse.json().catch(()=>({}));
      if (health.api_version !== '7.0.0' || health.auth_routes?.owner_login !== true) {
        return 'خادم Render يعمل، لكن النسخة المنشورة لا تعلن عن مسار دخول المالك المطلوب. انشر مجلد backend من إصدار V7 على خدمة Render، وتأكد أن Root Directory يشير إلى backend وأن أمر التشغيل هو npm start.';
      }
      if (!healthResponse.ok) {
        return `نسخة Backend V7 موجودة، لكن فحص الصحة أعاد HTTP ${healthResponse.status}. راجع اتصال PostgreSQL وسجلات Render قبل إعادة المحاولة.`;
      }
      return 'فحص Render يؤكد أن نسخة V7 تعلن عن مسار دخول المالك، لكن طلب الدخول عاد 404. راجع إعدادات إعادة توجيه المسارات أو عنوان API في خدمة Render؛ لم تُرفض بيانات الدخول.';
    } catch (_) {
      return 'أعاد خادم Render الرمز HTTP 404، وتعذر فحص /api/health. راجع عنوان الخدمة وإعدادات نشر Backend على Render.';
    }
  }

  async function request(path, options={}){
    const headers={...(options.headers||{})}; if(state.token) headers.Authorization=`Bearer ${state.token}`;
    const response=await fetchApi(state.apiBase+path,{...options,headers});
    const body=await response.json().catch(()=>({}));
    if(!response.ok){const errors={owner_unauthorized:'انتهت جلسة المالك؛ سجّل الدخول مرة أخرى.',invalid_credentials:'بيانات دخول المالك غير صحيحة.',subscription_schema_not_migrated:'ترحيل قاعدة بيانات الاشتراكات لم يُنفذ على الخادم.',forbidden:'هذا الحساب ليس حساب مالك النظام.',invalid_duration:'مدة الاشتراك غير صحيحة.',month_mode_required:'اختر طريقة حساب الشهر.',user_limit_decision_required:'حدد عدد المستخدمين أو اختر غير محدود.',tenant_not_found:'المنشأة غير موجودة.',subscription_missing:'لا يوجد اشتراك لهذه المنشأة.'};const error=new Error(errors[body.error]||body.error||`فشل الطلب (HTTP ${response.status}).`);error.status=response.status;throw error;}
    return body;
  }
  function setAuthenticated(yes){ $('login-panel').classList.toggle('hidden',yes); $('dashboard-panel').classList.toggle('hidden',!yes); $('logout-btn').classList.toggle('hidden',!yes); }
  function td(text){const cell=document.createElement('td');cell.textContent=escapeText(text);return cell;}
  function pill(status){const el=document.createElement('span');el.className='pill '+(status||'');el.textContent=STATUS_LABELS[status]||status||'غير معروف';return el;}
  function button(label,klass,handler){const b=document.createElement('button');b.type='button';b.className=`btn ${klass}`;b.textContent=label;b.addEventListener('click',handler);return b;}
  function renderTenants(items){
    state.tenants=items||[]; $('tenant-count').textContent=String(state.tenants.length); const body=$('tenants-body');body.replaceChildren();
    if(!state.tenants.length){const row=document.createElement('tr');const cell=td('لا توجد منشآت حتى الآن.');cell.colSpan=6;cell.className='empty';row.append(cell);body.append(row);return;}
    for(const tenant of state.tenants){
      const row=document.createElement('tr');row.append(td(tenant.display_name),td(tenant.slug));const status=td('');status.append(pill(tenant.status));row.append(status);
      const subscription=tenant.duration_code?`${DURATION_LABELS[tenant.duration_code]||tenant.duration_code} — ${tenant.ends_at?formatDate(tenant.ends_at):'مدى الحياة'}`:'لا يوجد اشتراك';row.append(td(subscription));
      const limit=tenant.user_limit_unlimited?'غير محدود':String(tenant.user_limit??'—');row.append(td(`${tenant.active_users||0} / ${limit}`));
      const actions=td('');actions.className='row-actions';
      actions.append(button('تمديد','btn-secondary',()=>extendTenant(tenant)));
      actions.append(button('حد المستخدمين','btn-secondary',()=>changeLimit(tenant)));
      if(tenant.status==='active') actions.append(button('إيقاف','btn-danger',()=>suspendTenant(tenant)));
      row.append(actions);body.append(row);
    }
  }
  function renderCodes(items){
    state.codes=items||[];$('code-count').textContent=String(state.codes.length);const body=$('codes-body');body.replaceChildren();
    if(!state.codes.length){const row=document.createElement('tr');const cell=td('لا توجد أكواد مسجلة.');cell.colSpan=6;cell.className='empty';row.append(cell);body.append(row);return;}
    for(const code of state.codes){const row=document.createElement('tr');row.append(td(`•••• ${code.code_hint||'????'}`),td(DURATION_LABELS[code.duration_code]||code.duration_code),td(code.user_limit_unlimited?'غير محدود':String(code.user_limit??'—')));const status=td('');status.append(pill(code.status));row.append(status,td(formatDate(code.created_at)));const action=td('');if(code.status==='unused')action.append(button('إلغاء الكود','btn-danger',()=>cancelCode(code)));else action.textContent='—';row.append(action);body.append(row);}
  }
  async function refresh(){
    message('global-message','');$('refresh-btn').disabled=true;
    try{const [tenants,codes]=await Promise.all([request('/api/owner/tenants'),request('/api/owner/activation-codes')]);renderTenants(tenants.items);renderCodes(codes.items);}
    catch(error){message('global-message',error.message);if(error.status===401||/انتهت|غير صحيحة/.test(error.message)){state.token='';sessionStorage.removeItem('bakry_owner_token');setAuthenticated(false);}}
    finally{$('refresh-btn').disabled=false;}
  }
  async function login(event){event.preventDefault();message('login-message','');const button=document.querySelector('#owner-login-form button[type="submit"]');if(button){button.disabled=true;button.dataset.originalText ||= button.textContent;button.textContent='جارٍ الاتصال بالخادم...';}
    try{state.apiBase=normalizeBase($('api-base').value);const username=$('owner-username').value.trim();const password=$('owner-password').value;
      if(!username||!password) throw new Error('أدخل اسم المستخدم وكلمة المرور.');
      const result=await fetchApi(`${state.apiBase}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
      const body=await result.json().catch(()=>({}));
      if(!result.ok) {
        if(result.status===404) throw new Error(await diagnoseOwnerLogin404(state.apiBase));
        const errors={invalid_credentials:'بيانات دخول المالك غير صحيحة.',too_many_attempts:'محاولات الدخول كثيرة؛ انتظر قليلًا ثم حاول مجددًا.'};
        throw new Error(errors[body.error]||body.error||`فشل تسجيل الدخول (HTTP ${result.status}).`);
      }
      if(!body.token) throw new Error('استجاب الخادم دون إصدار جلسة دخول صالحة. راجع سجلات Render.');
      state.token=body.token;sessionStorage.setItem('bakry_owner_token',state.token);localStorage.setItem('bakry_owner_api_base',state.apiBase);$('owner-password').value='';message('login-message','تم تسجيل الدخول بنجاح.','success');setAuthenticated(true);await refresh();
    }catch(error){message('login-message',error.message||'تعذر تسجيل الدخول إلى لوحة المالك.');}finally{if(button){button.disabled=false;button.textContent=button.dataset.originalText||'دخول آمن';}}
  }
  function getUserLimit(){const mode=$('code-user-limit-mode').value;if(mode==='unlimited')return 'unlimited';if(mode==='custom'){const n=Number($('code-user-limit-custom').value);if(!Number.isInteger(n)||n<1)throw new Error('أدخل حدًا صحيحًا أكبر من صفر.');return n;}return Number(mode);}
  async function createCode(event){event.preventDefault();const button=document.querySelector('#code-form button[type="submit"]');if(button)button.disabled=true;message('global-message','');$('new-code-card').classList.add('hidden');
    try{const duration=$('code-duration').value;const body={duration,userLimit:getUserLimit()};if(duration.startsWith('month_'))body.monthMode=$('code-month-mode').value;const result=await request('/api/owner/activation-codes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});$('new-code-value').textContent=result.code;$('new-code-card').classList.remove('hidden');message('global-message','تم إنشاء كود التفعيل. انسخه الآن؛ لن يظهر كاملًا مرة أخرى.','success');await refresh();}
    catch(error){message('global-message',error.message);}finally{if(button)button.disabled=false;}
  }
  async function cancelCode(code){if(!confirm('هل تريد إلغاء كود التفعيل غير المستخدم؟'))return;try{await request(`/api/owner/activation-codes/${encodeURIComponent(code.id)}/cancel`,{method:'POST'});message('global-message','تم إلغاء الكود.','success');await refresh();}catch(error){message('global-message',error.message);}}
  async function suspendTenant(tenant){if(!confirm(`سيتم إيقاف دخول منشأة «${tenant.display_name}». هل تتابع؟`))return;try{await request(`/api/owner/tenants/${encodeURIComponent(tenant.id)}/suspend`,{method:'POST'});message('global-message','تم إيقاف المنشأة.','success');await refresh();}catch(error){message('global-message',error.message);}}
  async function changeLimit(tenant){const initial=tenant.user_limit_unlimited?'unlimited':String(tenant.user_limit||5);const input=prompt('أدخل عدد المستخدمين المسموح به، أو اكتب unlimited:',initial);if(input===null)return;const limit=input.trim()==='unlimited'?'unlimited':Number(input);if(!(limit==='unlimited'||Number.isInteger(limit)&&limit>=1)){message('global-message','أدخل رقمًا موجبًا صحيحًا أو unlimited.');return;}try{await request(`/api/owner/tenants/${encodeURIComponent(tenant.id)}/user-limit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userLimit:limit})});message('global-message','تم تحديث حد المستخدمين.','success');await refresh();}catch(error){message('global-message',error.message);}}
  async function extendTenant(tenant){const duration=prompt('اختر مدة التمديد بكتابة واحدة من: month_1 أو month_2 أو month_4 أو year_1 أو lifetime','year_1');if(!duration)return;if(!Object.prototype.hasOwnProperty.call(DURATION_LABELS,duration)){message('global-message','قيمة مدة غير صحيحة.');return;}const body={duration};if(duration.startsWith('month_')){const mode=prompt('طريقة حساب الشهر: calendar أو 30_days','calendar');if(!['calendar','30_days'].includes(mode))return;body.monthMode=mode;}try{await request(`/api/owner/tenants/${encodeURIComponent(tenant.id)}/extend`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});message('global-message','تم تمديد الاشتراك وإعادة تفعيل المنشأة.','success');await refresh();}catch(error){message('global-message',error.message);}}
  function updateCodeForm(){const duration=$('code-duration').value;$('code-month-mode-wrap').classList.toggle('hidden',!duration.startsWith('month_'));const custom=$('code-user-limit-mode').value==='custom';$('code-user-limit-custom-wrap').classList.toggle('hidden',!custom);}
  function logout(){state.token='';sessionStorage.removeItem('bakry_owner_token');setAuthenticated(false);}
  $('owner-login-form').addEventListener('submit',login);$('code-form').addEventListener('submit',createCode);$('refresh-btn').addEventListener('click',refresh);$('logout-btn').addEventListener('click',logout);$('code-duration').addEventListener('change',updateCodeForm);$('code-user-limit-mode').addEventListener('change',updateCodeForm);$('copy-code-btn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('new-code-value').textContent);message('global-message','تم نسخ كود التفعيل.','success');}catch{message('global-message','تعذر النسخ التلقائي؛ حدّد الكود وانسخه يدويًا.');}});
  $('api-base').value=localStorage.getItem('bakry_owner_api_base')||'';updateCodeForm();
  const savedToken=sessionStorage.getItem('bakry_owner_token');if(savedToken){state.token=savedToken;try{state.apiBase=normalizeBase(localStorage.getItem('bakry_owner_api_base')||'');setAuthenticated(true);refresh();}catch{logout();}}
})();
