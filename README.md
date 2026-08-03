# نهضة الملائكة (Nahdat al-Malaika) 👼

PWA عربية (RTL) لإدارة الأطفال والحضور والنقاط — مبنية بـ Next.js + Supabase وجاهزة للنشر على Vercel.

## URLs
- **GitHub**: https://github.com/stmaryluxorprim-hash/Nahdet-El-Malayka
- **Production**: (يُضاف بعد الربط مع Vercel)

## ✅ الوحدات المكتملة

| الوحدة | الوصف |
|--------|-------|
| 🔐 المصادقة | تسجيل دخول / إنشاء حساب → موافقة المدير → دخول. أول حساب يُسجَّل يصبح **مديراً معتمداً تلقائياً** |
| 🛡️ RBAC | 3 أدوار (مدير / مشرف / خادم) مع 11 صلاحية دقيقة مطبَّقة في الواجهة وفي قاعدة البيانات (RLS) |
| 👼 إضافة طفل | زر + → ماسح QR → مودال (الاسم، الهاتف `+20` + 10 أرقام بالضبط، النوع، الفصل، تاريخ الميلاد، ملاحظات) + صورة (كاميرا/معرض → قص وتحريك وتكبير → ضغط WebP ≤100KB → Supabase Storage) |
| 🏫 الفصول | حسب الفصل والتاريخ (اليوم أو أي تاريخ): حضور/تأخير/غياب مع نقاط تلقائية، إضافة/خصم نقاط، اتصال، واتساب، SMS، تعديل، حذف |
| 📷 الماسح | مسح كود → تسجيل حضور تلقائي بالتاريخ المحدد + نقاط الحضور القابلة للتعديل، مع صوت تأكيد وسجلّ عمليات وورقة إجراءات كاملة |
| 📊 الإحصائيات | بطاقات إجمالية، حضور آخر 7 أيام (خطي)، حضور اليوم حسب الفصل (أعمدة)، أعلى 10 أطفال بالنقاط |
| ⚙️ الإعدادات | موافقة/رفض المستخدمين، تعيين الأدوار، إدارة الفصول، ضبط نقاط الحضور، حسابي وتسجيل الخروج |
| 📱 PWA | Manifest عربي RTL + أيقونة ملاك + Service Worker — قابل للتثبيت على الهاتف |

## 🗄️ بنية البيانات (Supabase)

- **profiles** — المستخدمون (مرتبط بـ auth.users) مع الحالة والدور
- **roles / permissions / role_permissions** — نظام RBAC
- **classes** — الفصول (7 فصول افتراضية)
- **children** — الأطفال (كود QR فريد، هاتف بقيد `+20` + 10 أرقام على مستوى قاعدة البيانات)
- **attendance** — الحضور (فريد لكل طفل/تاريخ)
- **point_transactions** — سجل النقاط الكامل (Trigger يحدّث `total_points` تلقائياً)
- **app_settings** — إعدادات النقاط والتطبيق
- **activity_log** — سجل النشاط
- **Storage**: bucket `children-photos` (عام للقراءة، الرفع بصلاحية)
- **RLS** مفعَّل على جميع الجداول مع دوال `is_admin()` / `has_permission()`

## 🚀 خطوات التشغيل (3 خطوات)

### 1) قاعدة البيانات
افتح **Supabase Dashboard → SQL Editor** وشغِّل ملف [`supabase/schema.sql`](supabase/schema.sql) بالكامل (مرة واحدة).

### 2) Vercel
- اربط هذا المستودع بـ Vercel (Framework: **Next.js** — يُكتشف تلقائياً)
- أضف متغيّري البيئة في **Settings → Environment Variables**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - (تجدهما في Supabase → Project Settings → API)

### 3) أول حساب
سجِّل أول حساب من صفحة التسجيل — سيصبح **المدير المعتمد** تلقائياً. الحسابات التالية تنتظر موافقتك من الإعدادات → المستخدمون.

> ⚠️ في Supabase → Authentication → Providers → Email: يمكنك تعطيل "Confirm email" لتسهيل الدخول المباشر.

## 🧰 التقنيات
Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (Auth + DB + Storage + RLS) · html5-qrcode · react-easy-crop · browser-image-compression (WebP) · Recharts · PWA

## التطوير محلياً
```bash
cp .env.example .env.local   # ضع بيانات Supabase
npm install
npm run dev
```

## ما لم يُنفَّذ بعد / خطوات مقترحة
- إشعارات Push للتذكير بالحضور
- تصدير التقارير PDF/Excel
- طباعة أكواد QR من داخل التطبيق
- ربط الخدام بفصول محددة (الجدول `user_classes` جاهز في القاعدة)

---
آخر تحديث: 2026-08-03
