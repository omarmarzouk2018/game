/**
 * @file buildMenuData.ts
 * Data definitions and catalog for the Anno-style construction menu.
 * Adheres to Separation of Concerns by isolating buildable item definitions from UI logic.
 */

export type BuildCategoryId = 'infrastructure' | 'farmers' | 'industry' | 'harbor'

export interface ResourceCost {
  readonly gold?: number
  readonly wood?: number
  readonly stone?: number
}

export interface BuildItem {
  readonly id: string
  readonly name: string
  readonly category: BuildCategoryId
  readonly icon: string
  readonly image?: string
  readonly description: string
  readonly cost: ResourceCost
  readonly maintenance: number
  readonly isAvailable: boolean
  readonly toolKey?: 'dirt_road' | 'stone_road'
  readonly unlockRequirement?: string
  readonly dimensions?: string
}

export interface BuildCategory {
  readonly id: BuildCategoryId
  readonly label: string
  readonly icon: string
  readonly items: readonly BuildItem[]
}

import dirtRoadImg from '../../assets/ui/buildings/dirt_road.jpg'
import stoneRoadImg from '../../assets/ui/buildings/stone_road.jpg'
import woodenBridgeImg from '../../assets/ui/buildings/wooden_bridge.jpg'
import pioneerCottageImg from '../../assets/ui/buildings/pioneer_cottage.jpg'
import marketSquareImg from '../../assets/ui/buildings/market_square.jpg'
import waterWellImg from '../../assets/ui/buildings/water_well.jpg'
import lumberjackCabinImg from '../../assets/ui/buildings/lumberjack_cabin.jpg'
import sawmillImg from '../../assets/ui/buildings/sawmill.jpg'
import wheatFarmImg from '../../assets/ui/buildings/wheat_farm.jpg'
import coastalWarehouseImg from '../../assets/ui/buildings/coastal_warehouse.jpg'
import harborQuayImg from '../../assets/ui/buildings/harbor_quay.jpg'

export const BUILD_CATEGORIES: readonly BuildCategory[] = [
  {
    id: 'infrastructure',
    label: 'طرق وبنية تحتية',
    icon: '🛤️',
    items: [
      {
        id: 'dirt_road',
        name: 'طريق ترابي',
        category: 'infrastructure',
        icon: '🛤️',
        image: dirtRoadImg,
        description: 'طريق ممهّد أساسي يربط بين الأكواخ والمخازن ويسرّع حركة البضائع والسكان.',
        cost: { gold: 5 },
        maintenance: 0,
        isAvailable: true,
        toolKey: 'dirt_road',
        dimensions: '1×1',
      },
      {
        id: 'stone_road',
        name: 'طريق مرصوف',
        category: 'infrastructure',
        icon: '🏛️',
        image: stoneRoadImg,
        description: 'طريق حجري صلب ومقاوم يزيد سرعة عربات النقل وتدفق التجارة إلى الضعف.',
        cost: { gold: 20, stone: 2 },
        maintenance: 1,
        isAvailable: false,
        toolKey: 'stone_road',
        unlockRequirement: 'يتطلب ترقية المستوطنة',
        dimensions: '1×1',
      },
      {
        id: 'wooden_bridge',
        name: 'جسر خشبي',
        category: 'infrastructure',
        icon: '🌉',
        image: woodenBridgeImg,
        description: 'معبر خشبي فوق الخلجان والمجاري المائية لربط شواطئ الجزيرة.',
        cost: { gold: 50, wood: 8 },
        maintenance: 2,
        isAvailable: false,
        unlockRequirement: 'قيد التطوير',
        dimensions: '2×1',
      },
    ],
  },
  {
    id: 'farmers',
    label: 'المزارعون والسكن',
    icon: '🛖',
    items: [
      {
        id: 'pioneer_cottage',
        name: 'كوخ المزارعين',
        category: 'farmers',
        icon: '🛖',
        image: pioneerCottageImg,
        description: 'مسكن خشبي ريفي للرواد والمزارعين؛ يوفّر القوة العاملة ويدفع الضرائب.',
        cost: { gold: 10, wood: 2 },
        maintenance: 0,
        isAvailable: true,
        unlockRequirement: 'الطبقة الأساسية',
        dimensions: '3×3',
      },
      {
        id: 'market_square',
        name: 'ساحة السوق',
        category: 'farmers',
        icon: '🎪',
        image: marketSquareImg,
        description: 'مركز النشاط الاجتماعي والتجاري؛ ضروري لتلبية الاحتياجات الأساسية للسكان.',
        cost: { gold: 100, wood: 10 },
        maintenance: 5,
        isAvailable: true,
        unlockRequirement: 'مبنى مدني أساسي',
        dimensions: '4×4',
      },
      {
        id: 'water_well',
        name: 'بئر مياه',
        category: 'farmers',
        icon: '💧',
        image: waterWellImg,
        description: 'يوفر مياهاً نقية للمنازل القريبة ويزيد كفاءة الوقاية من الحرائق.',
        cost: { gold: 30, wood: 4 },
        maintenance: 1,
        isAvailable: true,
        unlockRequirement: 'الطبقة الأساسية',
        dimensions: '2×2',
      },
    ],
  },
  {
    id: 'industry',
    label: 'الإنتاج والصناعة',
    icon: '🪓',
    items: [
      {
        id: 'lumberjack_cabin',
        name: 'كوخ الحطّاب',
        category: 'industry',
        icon: '🪓',
        image: lumberjackCabinImg,
        description: 'يقطع الأشجار من الغابات المحيطة لإنتاج جذوع الخشب الخام للبناء.',
        cost: { gold: 50 },
        maintenance: 3,
        isAvailable: true,
        unlockRequirement: 'إنتاج أساسي',
        dimensions: '3×3',
      },
      {
        id: 'sawmill',
        name: 'منشرة الخشب',
        category: 'industry',
        icon: '🪵',
        image: sawmillImg,
        description: 'تعالج جذوع الخشب الخام من كوخ الحطاب وتحولها إلى ألواح بناء جاهزة.',
        cost: { gold: 80, wood: 6 },
        maintenance: 4,
        isAvailable: true,
        unlockRequirement: 'صناعة الأخشاب',
        dimensions: '3×3',
      },
      {
        id: 'sheep_farm',
        name: 'مزرعة الأغنام',
        category: 'industry',
        icon: '🐑',
        description: 'تربية الأغنام وإنتاج الصوف الطبيعي لإمداد مغازل النسيج والملابس.',
        cost: { gold: 120, wood: 8 },
        maintenance: 4,
        isAvailable: false,
        unlockRequirement: 'يتطلب 50 مزارعاً',
        dimensions: '4×4',
      },
      {
        id: 'wheat_farm',
        name: 'حقول القمح',
        category: 'industry',
        icon: '🌾',
        image: wheatFarmImg,
        description: 'زراعة الحبوب الذهبية لتوفير الطحين للمخابز وإطعام أهالي المستوطنة.',
        cost: { gold: 100, wood: 6 },
        maintenance: 3,
        isAvailable: false,
        unlockRequirement: 'يتطلب 100 مزارع',
        dimensions: '4×4',
      },
    ],
  },
  {
    id: 'harbor',
    label: 'الموانئ والتجارة',
    icon: '⚓',
    items: [
      {
        id: 'coastal_warehouse',
        name: 'مستودع ساحلي',
        category: 'harbor',
        icon: '📦',
        image: coastalWarehouseImg,
        description: 'مركز لوجستي محوري يجمع البضائع ويسيّر عربات النقل لتوزيعها.',
        cost: { gold: 150, wood: 12 },
        maintenance: 6,
        isAvailable: true,
        unlockRequirement: 'مبنى لوجستي',
        dimensions: '4×4',
      },
      {
        id: 'harbor_quay',
        name: 'رصيف المرفأ',
        category: 'harbor',
        icon: '⚓',
        image: harborQuayImg,
        description: 'رصيف بحري متقدم على ساحل الخليج لاستقبال سفن التجارة والإمداد.',
        cost: { gold: 200, wood: 20 },
        maintenance: 8,
        isAvailable: false,
        unlockRequirement: 'يتطلب شاطئ صالح للملاحة',
        dimensions: '4×2',
      },
      {
        id: 'shipyard',
        name: 'حوض بناء السفن',
        category: 'harbor',
        icon: '⛵',
        description: 'ورشة بناء السفن الشراعية للاستكشاف والتبادل التجاري مع العالم الخارجي.',
        cost: { gold: 350, wood: 30 },
        maintenance: 15,
        isAvailable: false,
        unlockRequirement: 'يتطلب ترقية المرفأ',
        dimensions: '5×5',
      },
    ],
  },
]
