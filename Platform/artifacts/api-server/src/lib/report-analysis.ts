import type { AnalysisResult } from "@workspace/api-zod";

type Analysis = Omit<AnalysisResult, "incidentClass"> & {
  incidentClass: AnalysisResult["incidentClass"];
};

const locationMap: Array<[string, string]> = [
  ["جنزور", "Janzour"],
  ["تاجوراء", "Tajoura"],
  ["طرابلس", "Tripoli"],
  ["مصراتة", "Misrata"],
  ["بنغازي", "Benghazi"],
  ["الزاوية", "Zawiya"],
  ["غريان", "Gharyan"],
  ["زليتن", "Zliten"],
  ["سبها", "Sabha"],
];

export function analyzeReportText(text: string): Analysis {
  const normalized = text.toLowerCase();
  const hasAny = (terms: string[]) => terms.some((term) => normalized.includes(term));
  const peopleAtRisk = hasAny([
    "طفل",
    "أطفال",
    "مصاب",
    "إصابة",
    "محاصر",
    "عالق",
    "إنقاذ",
    "إسعاف",
    "نجدة",
    "شخص",
  ]);

  let incidentClass: Analysis["incidentClass"] = "Other";
  let priority: Analysis["priority"] = "Low";
  let requiredSupport = "None";

  if (hasAny(["حريق", "انفجار", "دخان", "نار"])) {
    incidentClass = "Fire / Explosion";
    priority = peopleAtRisk ? "Critical" : "High";
    requiredSupport = peopleAtRisk ? "Firefighting / Rescue" : "Firefighting";
  } else if (hasAny(["مطر", "أمطار", "فيضان", "سيول", "مياه", "عاصفة", "رياح"])) {
    incidentClass = "Flood / Severe Weather";
    priority = hasAny(["فيضان", "سيول", "غرق"]) ? "High" : "Medium";
    requiredSupport = hasAny(["طريق", "شارع", "مسكر", "مغلق"]) ? "Traffic Management" : "Rescue";
  } else if (hasAny(["كهرباء", "مياه", "صرف صحي", "وقود", "محطة", "بنية تحتية"])) {
    incidentClass = "Infrastructure / Utilities";
    priority = "Medium";
    requiredSupport = "None";
  } else if (hasAny(["حادث", "طريق", "مرور", "سيارة", "سيارات", "ازدحام"])) {
    incidentClass = "Road / Transportation";
    priority = peopleAtRisk ? "High" : "Medium";
    requiredSupport = peopleAtRisk ? "Medical / Traffic Management" : "Traffic Management";
  } else if (hasAny(["إصابة", "مصاب", "محاصر", "عالق", "إسعاف", "إنقاذ", "حالة صحية"])) {
    incidentClass = "People at Risk / Medical";
    priority = "High";
    requiredSupport = "Medical / Rescue";
  }

  const location = locationMap.find(([arabic]) => normalized.includes(arabic))?.[1] ?? "Unknown";

  let summary = `بلاغ يتعلق بـ ${incidentClass.toLowerCase()} في ${location}.`;
  if (incidentClass === "Fire / Explosion") {
    summary = peopleAtRisk
      ? `بلاغ عن اندلاع حريق في ${location} مع وجود أشخاص معرضين للخطر، مما يتطلب استجابة عاجلة.`
      : `بلاغ عن حريق في ${location} يتطلب دعماً من فرق الإطفاء.`;
  } else if (incidentClass === "Flood / Severe Weather") {
    summary = `بلاغ عن أحوال جوية ومياه متجمعة في ${location} قد تؤثر على حركة المرور.`;
  } else if (incidentClass === "Infrastructure / Utilities") {
    summary = `بلاغ عن مشكلة في البنية التحتية أو الخدمات العامة في ${location}.`;
  } else if (incidentClass === "Road / Transportation") {
    summary = `بلاغ عن حادث أو خطر مروري في ${location} يحتاج إلى متابعة وتنظيم حركة المرور.`;
  } else if (incidentClass === "People at Risk / Medical") {
    summary = `بلاغ عن شخص يحتاج إلى مساعدة أو رعاية طبية في ${location}.`;
  }

  return {
    incidentClass,
    priority,
    location,
    peopleAtRisk,
    requiredSupport,
    relevance: "",
    summary,
  };
}