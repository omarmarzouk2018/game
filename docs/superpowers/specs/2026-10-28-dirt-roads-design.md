# مواصفات مرحلة بناء الطرق: الطرق الترابية البدائية

**الحالة:** مواصفات تصميم المرحلة الثانية  
**المشروع:** Empire Realms  
**التاريخ:** 2026-10-28  
**المرجع:** `GAME_DESIGN_NOTES.md` (قسم الطرق)

---

## 1. الهدف

إتاحة إمكانية بناء شبكة طرق أولية بدائية ("طرق ترابية / ممهدة") على الجزيرة بواسطة الماوس عبر السحب (Drag-to-draw)، وحساب تكلفتها من خزانة الذهب، والتحقق التلقائي من صلاحية المسار وتضاريسه وتوصيله بالطرق القائمة بسلاسة.

---

## 2. قواعد اللعبة والمتطلبات الوظيفية

### 2.1 نوع الطريق البدائي
- النوع الأساسي: **طريق ترابي (Dirt Road)**.
- تكلفة الوحدة: **5 عملات ذهبية** لكل مربع/بلاطة طريق جديدة (New Tile/Cell).
- رصيد البدء للاعب: **500 عملة ذهبية**.
- البلاطات التي تمر فوق طريق مبني سابقاً لا يُعاد احتساب تكلفتها مرة أخرى.

### 2.2 آلية البناء والتفاعل
1. **أداة الطريق في الواجهة:**
   - زر لتفعيل وضع بناء الطرق الترابية في شريط الأدوات (Road Tool).
   - مؤشر الماوس يتحول إلى وضع التحديد، وعند النقر والسحب يُرسم مسار مقترح مؤقت (Preview/Ghost).
2. **توجيه المسار والسحب (Drag-to-Draw):**
   - السحب يحدد نقطة البداية ونقطة النهاية، ويتم توليد المسار بخطوط متصلة على شبكة افتراضية (Grid Tiles بحجم 2م × 2م مثلاً).
   - يدعم السحب الخطوط المستقيمة والانعطافات بزوايا قائمة أو خطوط سلسة (Cardinal 4-way / Orthogonal).
3. **التحقق من الصلاحية (Validation):**
   - **الارتفاع عن البحر:** يجب أن يكون الطريق فوق سطح الماء بالكامل (`height > 0.5`).
   - **الانحدار:** لا يمكن بناء الطريق على منحدر جبلي حاد (`slope < 25°`).
   - **الرصيد المالي:** يجب أن تتوفر عملات كافية لتغطية عدد البلاطات الجديدة.
   - **المعاينة البصرية (Feedback):** 
     - يظهر مسار المعاينة باللون **الأخضر** الشفاف إذا كان صالحاً، مع عرض التكلفة المحدثة حياً (مثلاً: `15 ذهب`).
     - يظهر باللون **الأحمر** الشفاف إذا كان غير صالح (مثلاً: "منحدر حاد" أو "مغمور بالمياه" أو "رصيد غير كافٍ").
4. **تأكيد أو إلغاء البناء:**
   - إفلات زر الماوس (Mouse Up) يؤكد البناء ويخصم التكلفة ويضيف قطع الطريق إلى شبكة الطرق `RoadNetwork`.
   - الضغط على زر **Esc** أو النقر بزر الماوس الأيمن يلغي المسار الحالي أو يغلق أداة الطريق.
5. **الربط والتقاطعات (Connectivity & Junctions):**
   - عند ملامسة المسار الجديد لطريق موجود، يُدمج المسار تلقائياً في شبكة الطرق ليصبح متصلاً.

---

## 3. المعمارية وفصل المسؤوليات (Separation of Concerns)

تلتزم الشيفرة بالفصل الكامل بين الطبقات الأربع وفق معايير المشروع:

```
src/game/roads/
  ├── RoadTypes.ts          # Data Layer: Types, interfaces, constants
  ├── RoadNetwork.ts        # Data Layer: Graph of nodes, edges, grid lookup
  ├── RoadValidator.ts      # Business Logic: Slope, water, collision, funds checks
  ├── RoadBuilder.ts        # Business Logic: Drag-to-draw state machine & path generator
  ├── RoadGeometry.ts       # Presentation / Graphics: Procedural ribbon/tile mesh over terrain
  ├── RoadRenderer.ts       # Presentation / Graphics: Three.js mesh management & preview rendering
  └── index.ts              # Unified exports
src/game/economy/
  └── EconomyManager.ts     # Business Logic / Data: Treasury balance & transactions
src/ui/
  ├── RoadToolbar.tsx       # UI Layer: React toolbar toggle & tool status
  ├── EconomyBar.tsx        # UI Layer: Gold balance display
  └── RoadPreviewOverlay.tsx # UI Layer: Cost tooltip & error notices
```

---

## 4. المظهر البصري والتقنيات (Three.js Presentation)

- **الطريق الترابي:** 
  - مسار ترابي دافئ مدمج مع تضاريس الجزيرة الخضراء.
  - إزاحة طفيفة فوق التضاريس (`yOffset = 0.05m`) لتجنب الـ Z-fighting.
  - خامة غير لامعة (Matte Dirt Material - Roughness ~0.9, Warm Brown/Ochre tone).
- **أداء العرض:**
  - دمج بلاطات الطرق في `InstancedMesh` أو `BufferGeometry` موحد لتقليل استدعاءات الرسم (Draw Calls) إلى الحد الأدنى حفاظاً على 60 إطاراً في الثانية.

---

## 5. خطة الاختبار وضمان الجودة

1. **اختبارات طبقة البيانات والمنطق (Vitest):**
   - التحقق من إضافة الطرق ودمج التقاطعات في `RoadNetwork.test.ts`.
   - التحقق من رفض بناء الطرق فوق الماء أو المنحدرات الحادة في `RoadValidator.test.ts`.
   - التحقق من احتساب التكلفة وخصمها من الرصيد بدقة في `EconomyManager.test.ts`.
   - اختبار آلة حالة الرسم بالسحب في `RoadBuilder.test.ts`.
2. **اختبارات العرض والواجهة:**
   - اختبار تفاعل واجهة المستخدم وظهور أداة الطريق في `RoadToolbar.test.tsx`.
   - اختبار إنشاء وتنظيف موارد Three.js الخاصة بالطرق دون تسريب في `RoadRenderer.test.ts`.
