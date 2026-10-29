# ⚙️ المعمارية التقنية ومقاييس الأداء (Technical Architecture & Performance)

[← العودة إلى الفهرس الرئيسي](../README.md)

يوثق هذا الملف الهيكل البرمجي العام للمشروع ومعايير الأداء المعتمدة.

---

## 🛠️ حزمة التقنيات (Tech Stack)

- **Frontend & UI:** React + TypeScript + Vite.
- **3D Graphics Engine:** Three.js داخل بيئة Canvas مستقلة ومنفصلة عن دورة حياة React (وفق مبدأ Separation of Concerns).
- **Styling:** Modern CSS مع دعم النوافذ الشفافة (HUD & Floating Toolbars).
- **Testing:** Vitest لاختبارات الوحدات (Unit Tests) لجميع خوارزميات التضاريس والطرق والاقتصاد.

---

## 🚀 استراتيجيات تحسين الأداء (Performance Optimizations)

1. **Instanced Rendering (`InstancedMesh`):**
   - تُستخدم لجميع العناصر المتكررة (آلاف الأشجار، الصخور، وخصلات العشب) لتقليل أوامر الرسم (Draw Calls) إلى الحد الأدنى.
2. **نظام مستويات التفاصيل (LOD - Level of Detail):**
   - تخفيض تعقيد المجسمات تدريجياً كلما ابتعدت كاميرا اللاعب، وإخفاء العناصر الدقيقة (مثل العشب الصغير) في المسافات البعيدة.
3. **أجهزة المراقبة المدمجة:**
   - [`src/game/island/FrameRateMonitor.ts`](../../src/game/island/FrameRateMonitor.ts): مراقبة استقرار معدل 60 إطار في الثانية (FPS).
   - [`src/game/island/performanceProfiler.ts`](../../src/game/island/performanceProfiler.ts): تتبع أوقات المعالجة وتحديد أي اختناقات (Bottlenecks).
