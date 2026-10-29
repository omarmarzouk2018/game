# 🏗️ نظام المباني والإنشاء (Buildings System)

[← العودة إلى الفهرس الرئيسي](../README.md)

يوثق هذا الملف مواصفات وتصنيفات المباني، مساحاتها (Footprints)، وقواعد إنشائها على الجزيرة، والمبنية في المجلد [`src/game/buildings/`](../../src/game/buildings/).

---

## 🏛️ كتالوج المباني ومواصفاتها (Building Catalog)

| المبنى | المساحة على الشبكة (Footprint) | التكلفة بالذهب | الارتفاع المرجعي | الوصف والوظيفة |
| :--- | :---: | :---: | :---: | :--- |
| **كوخ المستوطنين (Pioneer Cottage)** | `2 × 2` | `25` 🪙 | `3.2` م | مسكن أولي يزيد من عدد السكان والقوى العاملة. |
| **بئر المياه العذبة (Water Well)** | `2 × 2` | `40` 🪙 | `2.8` م | مصدر رئيسي لإمداد المباني السكنية بالمياه النظيفة. |
| **كوخ الحطاب (Lumberjack Cabin)** | `3 × 3` | `60` 🪙 | `3.8` م | يجمع الأخشاب من الغابات المجاورة بصورة دورية. |
| **منشرة الخشب (Sawmill)** | `4 × 3` | `120` 🪙 | `4.5` م | معالجة جذوع الأشجار وتحويلها إلى ألواح بناء. |
| **ساحة السوق العامة (Market Square)** | `4 × 4` | `150` 🪙 | `4.2` م | مركز التجارة وتوزيع السلع وتنشيط حركة السكان. |

---

## 📐 قواعد التحقق من البناء (Building Validation Rules)

تتم مراجعة موضع المبنى في الوقت الفعلي عبر [`BuildingValidator.ts`](file:///c:/development/game/src/game/buildings/BuildingValidator.ts) وفق الشروط الصارمة التالية:

1. **الارتفاع فوق مستوى البحر (Dry Land Only):**
   - يمنع البناء تحت منسوب المياه أو على السواحل الرطبة المغمورة (الحد الأدنى لارتفاع التضاريس هو `y ≥ 0.8m`).
2. **استواء التضاريس (Max Height Variation & Slope):**
   - أقصى فرق ارتفاع مسموح به بين زوايا بصمة المبنى هو `2.5m`.
   - أقصى انحدار للأرض هو `30°` لضمان استقرار الأساسات.
3. **منع التداخل (No Collision):**
   - يمنع تشييد المبنى فوق مسار طريق قائم أو فوق مبنى آخر تم تشييده مسبقاً.
4. **حدود الخريطة (Island Boundaries):**
   - يجب أن تقع كامل بصمة المبنى داخل النطاق الصالح للجزيرة.
5. **القدرة المالية (Gold Affordability):**
   - التحقق من كفاية رصيد الخزينة لدفع تكلفة المبنى قبل السماح بوضعه.

---

## 👻 المعاينة التفاعلية والمخططات الشفافة (Interactive 3D Blueprint Ghost)

أثناء اختيار أي مبنى من قائمة البناء ([`src/ui/buildMenu/BuildMenu.tsx`](file:///c:/development/game/src/ui/buildMenu/BuildMenu.tsx)):

- **المجسم الشفاف (3D Architectural Ghost):**
  - يظهر مجسم ثلاثي الأبعاد شفاف يمثل الحجم الهندسي للمبنى والأساسات على الشبكة.
  - محاط بخطوط إرشادية دقيقة (`LineSegments / Wireframe`) توضح حدود البصمة وأركانها.
- **تغذية بصرية فورية (Visual Status Feedback):**
  - **موضع صالح للبناء:** يضاء المجسم بلون سماوي شفاف (`#00d2ff` مع عتامة `0.55`).
  - **موضع غير صالح (انحدار، تداخل، مياه):** يتحول فوراً إلى لون أحمر تحذيري شفاف (`#ff4757` مع عتامة `0.60`).
- **تثبيت التفاعل بالكاميرا:**
  - يتمتع اللاعب بحرية كاملة لتحريك الكاميرا (`WASD`، الماوس، التدوير، والتقريب) أثناء حمل مخطط المبنى لاختيار أفضل زاوية وتثبيت المبنى في موقعه المثالي.

---

## 🧩 الهيكلية البرمجية (Source Code Layout)

- [`src/game/buildings/BuildingTypes.ts`](file:///c:/development/game/src/game/buildings/BuildingTypes.ts): تعريف أنواع المباني، البصمات، التكاليف، والأبعاد.
- [`src/game/buildings/BuildingManager.ts`](file:///c:/development/game/src/game/buildings/BuildingManager.ts): الفهرسة المكانية وإدارة المباني المشيدة على الجزيرة.
- [`src/game/buildings/BuildingValidator.ts`](file:///c:/development/game/src/game/buildings/BuildingValidator.ts): فحص شروط الموقع، استواء السطح، والميزانية.
- [`src/game/buildings/BuildingPlacement.ts`](file:///c:/development/game/src/game/buildings/BuildingPlacement.ts): منطق التفاعل وحالة المؤشر وإتمام البناء.
- [`src/game/buildings/BuildingRenderer.ts`](file:///c:/development/game/src/game/buildings/BuildingRenderer.ts): تصيير مجسمات المباني والمخططات الشفافة (Blueprints).
- [`src/ui/buildMenu/BuildMenu.tsx`](file:///c:/development/game/src/ui/buildMenu/BuildMenu.tsx): واجهة مستخدم قائمة الإنشاء التفاعلية.
