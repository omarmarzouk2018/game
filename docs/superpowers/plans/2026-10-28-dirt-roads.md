# خطة تنفيذ مرحلة بناء الطرق: الطرق الترابية البدائية

**الهدف:** تنفيذ نظام متكامل لبناء الطرق الترابية بالسحب بالماوس مع فحص التضاريس والاتصال والتكلفة وفق معمارية SoC واختبارات آلية شاملة.

**المرجع:** `docs/superpowers/specs/2026-10-28-dirt-roads-design.md`

---

## المهام المرحلية (Phased Implementation Tasks)

- [ ] **المهمة 1: طبقة البيانات واقتصاد الموارد (Data & Economy Layer)**
  - إنشاء `src/game/roads/RoadTypes.ts` (تعريف أنواع الطرق، إحداثيات البلاطة، وحالة العقد والحواف).
  - إنشاء `src/game/economy/EconomyManager.ts` وإدارته لرصيد الذهب (500 عملة ابتدائية) مع `EconomyManager.test.ts`.
  - إنشاء `src/game/roads/RoadNetwork.ts` مع بنية شبكية/رسم بياني (Grid/Graph) وتخزين البلاطات وفحص وجود طريق في نقطة معينة مع `RoadNetwork.test.ts`.

- [ ] **المهمة 2: طبقة منطق العمل والتحقق (Business Logic Layer)**
  - إنشاء `src/game/roads/RoadValidator.ts`:
    - فحص الارتفاع ومستوى الماء (`sample.land && sample.height > 0.5`).
    - فحص انحدار التضاريس (`slope < 25°`).
    - فحص كفاية الرصيد المالي (`EconomyManager.canAfford`).
    - اختبارات `RoadValidator.test.ts`.
  - إنشاء `src/game/roads/RoadBuilder.ts`:
    - توليد مسار بين نقطتي البداية والنهاية (Bresenham / Orthogonal Line interpolation).
    - حساب عدد البلاطات الجديدة غير الموجودة مسبقاً وتكلفتها الإجمالية.
    - دعم حالة السحب النشط (Drag start, drag update, commit, cancel).
    - اختبارات `RoadBuilder.test.ts`.

- [ ] **المهمة 3: طبقة الرسوميات والعرض ثلاثي الأبعاد (Presentation / Three.js Layer)**
  - إنشاء `src/game/roads/RoadGeometry.ts`:
    - بناء هندسة بلاطات الطريق الترابي المسقطة على ارتفاعات التضاريس (`sampleIslandTerrain`) مع هامش إزاحة للأعلى لمنع Z-fighting.
  - إنشاء `src/game/roads/RoadRenderer.ts`:
    - ريندر الطرق الترابية المبنية (خامة ترابية واقعية).
    - ريندر مسار المعاينة الشفاف (Ghost Preview) بالأخضر الصالح أو الأحمر المرفوض.
    - التخلص النظيف من الموارد الهندسية والخامات (Disposal).
    - اختبارات `RoadRenderer.test.ts`.

- [ ] **المهمة 4: طبقة واجهة المستخدم وتكامل المشهد (UI & Scene Integration)**
  - إنشاء `src/ui/RoadToolbar.tsx` وشريط الرصيد `EconomyBar.tsx` مع زر تفعيل وضع الطرق واختصارات لوحة المفاتيح (Esc للإلغاء).
  - ربط `RoadBuilder` بأحداث الماوس على مساحة المشهد في `IslandScene.ts`.
  - اختبارات واجهة المستخدم في `RoadToolbar.test.tsx`.
  - التحقق من تكامل المشهد واجتياز جميع اختبارات المشروع بنجاح.
