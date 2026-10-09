/**
 * Static fallback demo data shown on GitHub Pages when the backend is offline.
 * All queries use this as placeholderData — real API responses replace it automatically
 * once the backend responds.
 */
import type {
  DashboardSummary,
  LocationsSummary,
  AnalyticsSummary,
  Report,
} from '@workspace/api-client-react';

// ── helpers ──────────────────────────────────────────────────────────────────
const ago = (hours: number): string => {
  const d = new Date(Date.now() - hours * 3_600_000);
  return d.toISOString();
};

// days ago helper (for older reports)
const daysAgo = (days: number, hour = 10): string => {
  const d = new Date(Date.now() - days * 86_400_000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

// ── 30 demo reports ───────────────────────────────────────────────────────────
export const STATIC_REPORTS: Report[] = [
  {
    id: 1001,
    originalText: 'في حريق في منزل في جنزور وفي طفلين داخل البيت، الجيران يحاولون المساعدة وبحاجة للإطفاء بسرعة',
    incidentClass: 'Fire / Explosion',
    priority: 'Critical',
    location: 'جنزور',
    peopleAtRisk: true,
    requiredSupport: 'Firefighting / Rescue',
    summary: 'بلاغ عن اندلاع حريق في منزل بمنطقة جنزور مع وجود طفلين داخل المنزل مما يتطلب استجابة عاجلة.',
    createdAt: ago(0.4),
    updatedAt: ago(0.4),
    analysisTime: '1.8s',
  },
  {
    id: 1002,
    originalText: 'مصاب يحتاج إسعاف قرب دوار الشهداء في طرابلس رجل سقط من ارتفاع',
    incidentClass: 'People at Risk / Medical',
    priority: 'Critical',
    location: 'طرابلس',
    peopleAtRisk: true,
    requiredSupport: 'Medical / Rescue',
    summary: 'بلاغ عن إصابة خطيرة قرب دوار الشهداء في طرابلس تستوجب تدخل الإسعاف الفوري.',
    createdAt: ago(1.2),
    updatedAt: ago(1.2),
    analysisTime: '2.1s',
  },
  {
    id: 1003,
    originalText: 'دخان كثيف يتصاعد من مستودع وقود في الزاوية والناس القريبين خايفين والوضع خطير',
    incidentClass: 'Fire / Explosion',
    priority: 'Critical',
    location: 'الزاوية',
    peopleAtRisk: true,
    requiredSupport: 'Firefighting / Rescue',
    summary: 'بلاغ عن حريق في مستودع وقود بالزاوية يصدر منه دخان كثيف يثير مخاوف السكان المجاورين.',
    createdAt: ago(3.5),
    updatedAt: ago(3.5),
    analysisTime: '1.9s',
  },
  {
    id: 1004,
    originalText: 'تسمم جماعي لأكثر من 20 شخص بعد أكل من مطعم في حي الأندلس وفيه حالات خطيرة',
    incidentClass: 'People at Risk / Medical',
    priority: 'Critical',
    location: 'حي الأندلس',
    peopleAtRisk: true,
    requiredSupport: 'Medical / Rescue',
    summary: 'بلاغ عن تسمم جماعي في حي الأندلس ناجم عن وجبات ملوثة مع تسجيل حالات خطيرة.',
    createdAt: ago(4.5),
    updatedAt: ago(4.5),
    analysisTime: '2.3s',
  },
  {
    id: 1005,
    originalText: 'حادث سير بين شاحنة وسيارتين على الطريق الدائري في طرابلس وفيه 3 مصابين والطريق شبه مسكر',
    incidentClass: 'Road / Transportation',
    priority: 'High',
    location: 'طرابلس',
    peopleAtRisk: true,
    requiredSupport: 'Medical / Traffic Management',
    summary: 'حادث مروري بين شاحنة وسيارتين على الطريق الدائري بطرابلس خلّف ثلاثة مصابين وإغلاقاً جزئياً للطريق.',
    createdAt: ago(6.0),
    updatedAt: ago(6.0),
    analysisTime: '2.0s',
  },
  {
    id: 1006,
    originalText: 'سيول قوية في شارع الجمهورية في بنغازي دخلت المحلات والطوابق السفلية وفيه ناس ما قدروش يطلعوا',
    incidentClass: 'Flood / Severe Weather',
    priority: 'High',
    location: 'بنغازي',
    peopleAtRisk: true,
    requiredSupport: 'Rescue / Traffic Management',
    summary: 'بلاغ عن سيول اجتاحت شارع الجمهورية في بنغازي وأحكمت حصار بعض السكان داخل مبانيهم.',
    createdAt: ago(7.5),
    updatedAt: ago(7.5),
    analysisTime: '2.3s',
  },
  {
    id: 1007,
    originalText: 'تسريب مياه كبير من أنبوب رئيسي غرق الطريق في سبها حي 11 يونيو وخطر على المارة',
    incidentClass: 'Infrastructure / Utilities',
    priority: 'High',
    location: 'سبها',
    peopleAtRisk: false,
    requiredSupport: 'None',
    summary: 'بلاغ عن تسريب في أنبوب مياه رئيسي أغرق الطريق العام في حي 11 يونيو بسبها.',
    createdAt: ago(9.0),
    updatedAt: ago(9.0),
    analysisTime: '1.7s',
  },
  {
    id: 1008,
    originalText: 'أمطار غزيرة في غريان سببت انجراف جزء من الطريق الجبلي وأخاف السائقين',
    incidentClass: 'Flood / Severe Weather',
    priority: 'High',
    location: 'غريان',
    peopleAtRisk: false,
    requiredSupport: 'Traffic Management',
    summary: 'بلاغ عن انجراف جزء من الطريق الجبلي في غريان إثر أمطار غزيرة تشكّل خطراً على السائقين.',
    createdAt: ago(11.0),
    updatedAt: ago(11.0),
    analysisTime: '2.0s',
  },
  {
    id: 1009,
    originalText: 'حريق في سيارة متوقفة في شارع بن غشير وامتد لعربية جنبها السائق نجا بسلامة',
    incidentClass: 'Fire / Explosion',
    priority: 'High',
    location: 'طرابلس',
    peopleAtRisk: false,
    requiredSupport: 'Firefighting',
    summary: 'بلاغ عن حريق اشتعل في سيارة متوقفة بشارع بن غشير وامتد لمركبة مجاورة.',
    createdAt: ago(13.0),
    updatedAt: ago(13.0),
    analysisTime: '1.7s',
  },
  {
    id: 1010,
    originalText: 'طفل عمره 7 سنين ابتلع دواء من خزانة البيت في مدينة الخمس ومحتاجين مساعدة طبية عاجلة',
    incidentClass: 'People at Risk / Medical',
    priority: 'High',
    location: 'الخمس',
    peopleAtRisk: true,
    requiredSupport: 'Medical / Rescue',
    summary: 'بلاغ عن طفل في السابعة من عمره ابتلع دواءً في الخمس حالة طارئة تستدعي رعاية طبية فورية.',
    createdAt: ago(15.0),
    updatedAt: ago(15.0),
    analysisTime: '2.2s',
  },
  {
    id: 1011,
    originalText: 'انقطاع كهرباء مستمر منذ أمس في حي بن عاشور طرابلس وما فيه أي بيان من الشركة',
    incidentClass: 'Infrastructure / Utilities',
    priority: 'Medium',
    location: 'طرابلس',
    peopleAtRisk: false,
    requiredSupport: 'None',
    summary: 'بلاغ عن انقطاع متكرر للكهرباء في حي بن عاشور دون بيان رسمي من الجهة المعنية.',
    createdAt: ago(20.0),
    updatedAt: ago(20.0),
    analysisTime: '1.4s',
  },
  {
    id: 1012,
    originalText: 'ازدحام شديد جداً في محور صيام بطرابلس بسبب إغلاق نفق وتحويل المرور بدون لافتات',
    incidentClass: 'Road / Transportation',
    priority: 'Medium',
    location: 'طرابلس',
    peopleAtRisk: false,
    requiredSupport: 'Traffic Management',
    summary: 'بلاغ عن ازدحام مروري حاد في محور صيام بطرابلس جراء إغلاق نفق دون إشارات توجيهية.',
    createdAt: ago(22.0),
    updatedAt: ago(22.0),
    analysisTime: '1.6s',
  },
  {
    id: 1013,
    originalText: 'عاصفة رملية شديدة تضرب مدينة سبها والرؤية شبه صفر على الطرق الخارجية',
    incidentClass: 'Flood / Severe Weather',
    priority: 'Medium',
    location: 'سبها',
    peopleAtRisk: false,
    requiredSupport: 'Traffic Management',
    summary: 'بلاغ عن عاصفة رملية حادة في سبها تحدّ من الرؤية على الطرق الخارجية.',
    createdAt: ago(25.0),
    updatedAt: ago(25.0),
    analysisTime: '1.6s',
  },
  {
    id: 1014,
    originalText: 'تشقق واضح في حائط مدرسة ابتدائية في الزاوية بعد هطول الأمطار',
    incidentClass: 'Other',
    priority: 'Medium',
    location: 'الزاوية',
    peopleAtRisk: false,
    requiredSupport: 'None',
    summary: 'بلاغ عن تشققات ظهرت في جدران مدرسة ابتدائية بالزاوية عقب هطول الأمطار.',
    createdAt: ago(32.0),
    updatedAt: ago(32.0),
    analysisTime: '1.5s',
  },
  {
    id: 1015,
    originalText: 'قطعة كهرباء متقطعة في مصراتة بسبب محول قديم في حي الكورنيش المشكلة متكررة',
    incidentClass: 'Infrastructure / Utilities',
    priority: 'Medium',
    location: 'مصراتة',
    peopleAtRisk: false,
    requiredSupport: 'None',
    summary: 'بلاغ عن انقطاع متكرر للكهرباء في حي الكورنيش بمصراتة بسبب محول قديم.',
    createdAt: ago(36.0),
    updatedAt: ago(36.0),
    analysisTime: '1.3s',
  },
  {
    id: 1016,
    originalText: 'انقطاع في شبكة المياه منذ 3 أيام في طبرق والناس ما عندهم ماء خالص',
    incidentClass: 'Infrastructure / Utilities',
    priority: 'High',
    location: 'طبرق',
    peopleAtRisk: false,
    requiredSupport: 'None',
    summary: 'بلاغ عن انقطاع متواصل في إمدادات المياه لمدة ثلاثة أيام في طبرق.',
    createdAt: ago(44.0),
    updatedAt: ago(44.0),
    analysisTime: '1.5s',
  },
  {
    id: 1017,
    originalText: 'اندلاع حريق في مخزن مواد بلاستيكية في المنطقة الصناعية بمصراتة والدخان الأسود كثيف',
    incidentClass: 'Fire / Explosion',
    priority: 'High',
    location: 'مصراتة',
    peopleAtRisk: false,
    requiredSupport: 'Firefighting',
    summary: 'بلاغ عن حريق في مخزن مواد بلاستيكية بالمنطقة الصناعية بمصراتة يصدر عنه دخان أسود كثيف.',
    createdAt: ago(50.0),
    updatedAt: ago(50.0),
    analysisTime: '1.8s',
  },
  {
    id: 1018,
    originalText: 'مركبة قلبت في جنزور غرب طرابلس وفيه إصابتين متوسطتين',
    incidentClass: 'Road / Transportation',
    priority: 'High',
    location: 'جنزور',
    peopleAtRisk: true,
    requiredSupport: 'Medical / Traffic Management',
    summary: 'بلاغ عن انقلاب مركبة في جنزور غرب طرابلس مع تسجيل إصابتين متوسطتين.',
    createdAt: ago(54.0),
    updatedAt: ago(54.0),
    analysisTime: '1.9s',
  },
  {
    id: 1019,
    originalText: 'فيضان درنة تسبب في سقوط ضحايا وتلوث محتمل لمياه الشرب',
    incidentClass: 'Flood / Severe Weather',
    priority: 'Critical',
    location: 'درنة',
    peopleAtRisk: true,
    requiredSupport: 'Rescue',
    summary: 'بلاغ عن فيضان في درنة أسفر عن ضحايا وتلوث محتمل لمياه الشرب.',
    createdAt: ago(58.0),
    updatedAt: ago(58.0),
    analysisTime: '2.4s',
  },
  {
    id: 1020,
    originalText: 'ازدحام مروري في مدخل بني وليد بسبب حادث صغير وإغلاق المسار الأيسر جزئياً',
    incidentClass: 'Road / Transportation',
    priority: 'Low',
    location: 'بني وليد',
    peopleAtRisk: false,
    requiredSupport: 'Traffic Management',
    summary: 'بلاغ عن ازدحام في مدخل بني وليد جراء حادث بسيط وإغلاق جزئي للمسار الأيسر.',
    createdAt: ago(63.0),
    updatedAt: ago(63.0),
    analysisTime: '1.4s',
  },
  {
    id: 1021,
    originalText: 'سقوط شجرة كبيرة على سيارتين في النوفليين أثناء العاصفة وفيه أشخاص عالقين',
    incidentClass: 'Flood / Severe Weather',
    priority: 'High',
    location: 'النوفليين',
    peopleAtRisk: true,
    requiredSupport: 'Rescue',
    summary: 'بلاغ عن سقوط شجرة على سيارتين في النوفليين إثر عاصفة مع وجود أشخاص عالقين.',
    createdAt: ago(67.0),
    updatedAt: ago(67.0),
    analysisTime: '2.0s',
  },
  {
    id: 1022,
    originalText: 'الانترنت ضعيف هلبا وشبكة الارضي واقفة كامل في قصر بن غشير',
    incidentClass: 'Infrastructure / Utilities',
    priority: 'Medium',
    location: 'قصر بن غشير',
    peopleAtRisk: false,
    requiredSupport: 'None',
    summary: 'بلاغ عن انقطاع في شبكة الإنترنت الأرضي في قصر بن غشير يؤثر على الاتصالات.',
    createdAt: ago(70.0),
    updatedAt: ago(70.0),
    analysisTime: '1.4s',
  },
  {
    id: 1023,
    originalText: 'حريق واسع في منطقة صناعية مع انتشار الدخان إلى مناطق مجاورة في طرابلس',
    incidentClass: 'Fire / Explosion',
    priority: 'Critical',
    location: 'طرابلس',
    peopleAtRisk: true,
    requiredSupport: 'Firefighting / Rescue',
    summary: 'بلاغ عن حريق واسع في منطقة صناعية بطرابلس ينتشر دخانه للمناطق المجاورة.',
    createdAt: ago(90.0),
    updatedAt: ago(90.0),
    analysisTime: '2.0s',
  },
  {
    id: 1024,
    originalText: 'إخلاء مواطنين عالقين نتيجة ارتفاع منسوب المياه في جنوب طرابلس',
    incidentClass: 'Flood / Severe Weather',
    priority: 'Critical',
    location: 'طرابلس',
    peopleAtRisk: true,
    requiredSupport: 'Rescue',
    summary: 'بلاغ عن إخلاء مواطنين عالقين جراء ارتفاع منسوب المياه في جنوب طرابلس.',
    createdAt: ago(96.0),
    updatedAt: ago(96.0),
    analysisTime: '2.3s',
  },
  {
    id: 1025,
    originalText: 'انقطع الاتصال بمسن عمره 70 سنة من ما خرج من بيته في غريان',
    incidentClass: 'People at Risk / Medical',
    priority: 'High',
    location: 'غريان',
    peopleAtRisk: true,
    requiredSupport: 'Rescue',
    summary: 'بلاغ عن انقطاع الاتصال بمسن في غريان لم يتواصل منذ مغادرته منزله.',
    createdAt: ago(100.0),
    updatedAt: ago(100.0),
    analysisTime: '1.9s',
  },
  {
    id: 1026,
    originalText: 'هبوط في الطريق عند هون وسكروا مسار واحد لين يتم الإصلاح',
    incidentClass: 'Infrastructure / Utilities',
    priority: 'Medium',
    location: 'هون',
    peopleAtRisk: false,
    requiredSupport: 'None',
    summary: 'بلاغ عن هبوط في الطريق عند هون أفضى إلى إغلاق مسار لحين الإصلاح.',
    createdAt: ago(108.0),
    updatedAt: ago(108.0),
    analysisTime: '1.4s',
  },
  {
    id: 1027,
    originalText: 'عطل في محول كهربائي في تراغن قطع الكهرباء عن حي كامل',
    incidentClass: 'Infrastructure / Utilities',
    priority: 'Medium',
    location: 'تراغن',
    peopleAtRisk: false,
    requiredSupport: 'None',
    summary: 'بلاغ عن عطل في محول كهربائي في تراغن أدى إلى انقطاع الكهرباء عن حي بأكمله.',
    createdAt: ago(115.0),
    updatedAt: ago(115.0),
    analysisTime: '1.5s',
  },
  {
    id: 1028,
    originalText: 'حالة طارئة في الزاوية ومحتاجين سيارة إسعاف بأسرع وقت ممكن',
    incidentClass: 'People at Risk / Medical',
    priority: 'Critical',
    location: 'الزاوية',
    peopleAtRisk: true,
    requiredSupport: 'Medical / Rescue',
    summary: 'بلاغ عن حالة طارئة في الزاوية تستدعي إرسال سيارة إسعاف بشكل عاجل.',
    createdAt: ago(120.0),
    updatedAt: ago(120.0),
    analysisTime: '1.5s',
  },
  {
    id: 1029,
    originalText: 'الطريق بين زليتن وتاورغاء فيه حفرة كبيرة قلبت منها سيارة وفيه جرحى',
    incidentClass: 'Road / Transportation',
    priority: 'High',
    location: 'زليتن',
    peopleAtRisk: true,
    requiredSupport: 'Medical / Traffic Management',
    summary: 'بلاغ عن حفرة خطيرة تسببت في انقلاب سيارة على الطريق بين زليتن وتاورغاء مع وقوع جرحى.',
    createdAt: ago(130.0),
    updatedAt: ago(130.0),
    analysisTime: '2.0s',
  },
  {
    id: 1030,
    originalText: 'في سيارة واقفة من شهرين في شارع المعدات الطبية وبتعوق الحركة',
    incidentClass: 'Road / Transportation',
    priority: 'Low',
    location: 'طرابلس',
    peopleAtRisk: false,
    requiredSupport: 'Traffic Management',
    summary: 'بلاغ عن سيارة متروكة في شارع المعدات الطبية تعيق حركة المرور منذ شهرين.',
    createdAt: ago(140.0),
    updatedAt: ago(140.0),
    analysisTime: '1.2s',
  },
];

// ── derived summaries ─────────────────────────────────────────────────────────

function count(reports: Report[], key: keyof Report): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of reports) {
    const v = String(r[key]);
    m[v] = (m[v] ?? 0) + 1;
  }
  return m;
}

function toCountItems(m: Record<string, number>): { label: string; count: number }[] {
  return Object.entries(m)
    .map(([label, c]) => ({ label, count: c }))
    .sort((a, b) => b.count - a.count);
}

const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

// Reports created within the last 24 hours (matches ago() helper)
const last24h = new Date(Date.now() - 24 * 3_600_000);
const todayReports = STATIC_REPORTS.filter(r => new Date(r.createdAt) >= last24h);

export const STATIC_DASHBOARD: DashboardSummary = {
  totalReports: STATIC_REPORTS.length,
  criticalReports: STATIC_REPORTS.filter(r => r.priority === 'Critical').length,
  highPriority: STATIC_REPORTS.filter(r => r.priority === 'High').length,
  reportsToday: todayReports.length,
  recentReports: STATIC_REPORTS.slice(0, 6),
  byIncidentClass: toCountItems(count(STATIC_REPORTS, 'incidentClass')),
  byPriority: toCountItems(count(STATIC_REPORTS, 'priority')),
  byLocation: toCountItems(count(STATIC_REPORTS, 'location')),
};

export const STATIC_DASHBOARD_TODAY: DashboardSummary = {
  totalReports: todayReports.length,
  criticalReports: todayReports.filter(r => r.priority === 'Critical').length,
  highPriority: todayReports.filter(r => r.priority === 'High').length,
  reportsToday: todayReports.length,
  recentReports: todayReports.slice(0, 6),
  byIncidentClass: toCountItems(count(todayReports, 'incidentClass')),
  byPriority: toCountItems(count(todayReports, 'priority')),
  byLocation: toCountItems(count(todayReports, 'location')),
};

function buildLocationsSummary(): LocationsSummary {
  const m: Record<string, { reports: number; criticalReports: number; peopleAtRisk: number }> = {};
  for (const r of STATIC_REPORTS) {
    if (!r.location) continue;
    if (!m[r.location]) m[r.location] = { reports: 0, criticalReports: 0, peopleAtRisk: 0 };
    m[r.location].reports++;
    if (r.priority === 'Critical') m[r.location].criticalReports++;
    if (r.peopleAtRisk) m[r.location].peopleAtRisk++;
  }
  return {
    locations: Object.entries(m)
      .map(([location, s]) => ({ location, ...s }))
      .sort((a, b) => b.reports - a.reports),
  };
}

export const STATIC_LOCATIONS: LocationsSummary = buildLocationsSummary();

export const STATIC_ANALYTICS: AnalyticsSummary = {
  byIncidentClass: toCountItems(count(STATIC_REPORTS, 'incidentClass')),
  byPriority: toCountItems(count(STATIC_REPORTS, 'priority')),
  byLocation: toCountItems(count(STATIC_REPORTS, 'location')),
  bySupport: toCountItems(count(STATIC_REPORTS, 'requiredSupport')),
  peopleAtRisk: STATIC_REPORTS.filter(r => r.peopleAtRisk).length,
  totalFiltered: STATIC_REPORTS.length,
  evaluation: {
    accuracy: 0.915,
    precision: 0.912,
    recall: 0.913,
    macroF1: 0.913,
    confusionMatrix: [
      [41, 1, 0, 0, 1, 0],
      [1, 40, 1, 0, 0, 1],
      [0, 1, 42, 1, 0, 0],
      [0, 0, 1, 41, 1, 0],
      [1, 0, 0, 1, 40, 0],
      [0, 1, 0, 0, 1, 26],
    ],
  },
};
