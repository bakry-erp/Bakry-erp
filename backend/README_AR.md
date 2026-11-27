# Bakry ERP API — إعداد النشر الآمن على Render

## قبل النشر
- الخدمة وسيط آمن بين واجهة GitHub Pages وقاعدة PostgreSQL.
- لا تضع `DATABASE_URL` أو كلمة مرور المدير أو `JWT_SECRET` داخل ملفات الواجهة أو GitHub.
- جميع مسارات البيانات محمية بتوكن Bearer. تسجيل الدخول متاح عبر `POST /api/auth/login`.
- نقطة `/api/health` عامة ولا تعرض بيانات الاتصال أو تفاصيل قاعدة البيانات.
- هذه المرحلة تؤمّن واجهة API، لكنها لا تعني أن واجهة Bakry ERP متصلة بها بالفعل.

## النشر على Render
1. افتح https://render.com وسجّل الدخول.
2. اختر **New +** ثم **Web Service**، واربط مستودع GitHub الذي يحتوي مشروع Bakry ERP.
3. في إعدادات الخدمة اجعل **Root Directory** = `backend`.
4. **Runtime** = Node، و **Build Command** = `npm install`، و **Start Command** = `npm start`.
5. أضف Environment Variables التالية في Render:
   - `DATABASE_URL`: سلسلة الاتصال من Enzonic، مع SSL حسب بيانات مزود قاعدة البيانات.
   - `ADMIN_USERNAME`: اسم مستخدم إداري غير متوقع.
   - `ADMIN_PASSWORD`: كلمة مرور طويلة وفريدة.
   - `JWT_SECRET`: قيمة عشوائية طويلة لا تقل عن 32 حرفًا.
   - `APP_ORIGIN`: عنوان GitHub Pages الفعلي، مثل `https://bakry-erp.github.io` بعد التأكد من العنوان الصحيح.
   - `NODE_ENV`: `production`.
6. انشر الخدمة، ثم افتح `https://YOUR-SERVICE.onrender.com/api/health` وتأكد من ظهور `{"ok":true,...}`.

## إعداد PostgreSQL
نفّذ `schema.sql` مرة واحدة فقط على قاعدة `bakryerp` بعد أخذ نسخة احتياطية والتأكد من أنك على القاعدة والفرع الصحيحين. لا تنفذه قبل مراجعة الجداول الحالية.

## اختبار تسجيل الدخول
أرسل POST إلى `/api/auth/login` بجسم JSON يحتوي `username` و`password`. استخدم التوكن الناتج في ترويسة `Authorization: Bearer <token>` عند طلب مسارات `/api/stores/*` أو `/api/sync/batch`.

## ملاحظات وحدود مهمة
- هذه API مؤمّنة مبدئيًا لمستخدم إداري واحد؛ لا تشارك التوكن ولا تحفظه في مستودع GitHub.
- حماية CORS ليست بديلًا عن المصادقة.
- لا توجد حتى الآن مزامنة فعلية من واجهة التطبيق؛ يلزم تطوير adapter في `js/db.js` وربطه بتدفق العمليات في `js/app.js`، ثم اختبار التزامن والتعارضات قبل استخدام بيانات حقيقية.
- طابور IndexedDB المحلي يجب ألا يمسح العملية إلا بعد تأكيد نجاح الخادم.
- راجع إعداد SSL وسلسلة الاتصال من Enzonic؛ لا ترسل كلمة المرور أو السلسلة السرية في المحادثة أو الصور.
