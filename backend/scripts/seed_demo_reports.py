"""
Seed demo reports into the live Balaagh AI backend.

Usage (from repo root):
    backend\.venv\Scripts\python.exe backend/scripts/seed_demo_reports.py

Reads DEMO_API_TOKEN and the optional BASE_URL from backend/.env.
Default BASE_URL: http://127.0.0.1:8000
"""

import sys
import os
import time
import random
from pathlib import Path

# ── load .env manually (no extra dep needed) ────────────────────────────────
env_path = Path(__file__).resolve().parents[1] / ".env"
env = {}
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()

TOKEN = env.get("DEMO_API_TOKEN", "")
BASE_URL = os.environ.get("BASE_URL", env.get("BASE_URL", "http://127.0.0.1:8000")).rstrip("/")

if not TOKEN:
    sys.exit("ERROR: DEMO_API_TOKEN not found in backend/.env")

try:
    import httpx
except ImportError:
    sys.exit("ERROR: httpx not installed. Run: pip install httpx")

HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

# ── 30 varied demo reports ────────────────────────────────────────────────────
# Each entry: (original_text, incident_class, priority, location,
#              people_at_risk, required_support, summary, hours_ago)
REPORTS = [
    # ── Critical / past 2 hours ──
    ("في حريق في منزل في جنزور وفي طفلين داخل البيت، الجيران يحاولون المساعدة وبحاجة للإطفاء بسرعة",
     "Fire / Explosion", "Critical", "جنزور", True, "Firefighting / Rescue",
     "بلاغ عن اندلاع حريق في منزل بمنطقة جنزور مع وجود طفلين داخل المنزل مما يتطلب استجابة عاجلة.", 0.4),

    ("شخص محاصر داخل مبنى بعد انهيار جزئي في حي الصابري ببنغازي بحاجة انقاذ فوري",
     "People at Risk / Medical", "Critical", "بنغازي", True, "Rescue",
     "بلاغ عن شخص محاصر داخل مبنى انهار جزئياً في حي الصابري ببنغازي يحتاج تدخلاً عاجلاً.", 1.0),

    ("دخان كثيف يتصاعد من مستودع وقود في الزاوية والناس القريبين خايفين والوضع خطير",
     "Fire / Explosion", "Critical", "الزاوية", True, "Firefighting / Rescue",
     "بلاغ عن حريق في مستودع وقود بالزاوية يصدر منه دخان كثيف يثير مخاوف السكان المجاورين.", 3.5),

    ("تسمم جماعي لأكثر من 20 شخص بعد أكل من مطعم في حي الأندلس وفيه حالات خطيرة والمستشفى ممتلئ",
     "People at Risk / Medical", "Critical", "حي الأندلس", True, "Medical / Rescue",
     "بلاغ عن تسمم جماعي في حي الأندلس ناجم عن وجبات ملوثة مع تسجيل حالات خطيرة.", 4.5),

    # ── High / today ──
    ("مصاب يحتاج إسعاف قرب دوار الشهداء في طرابلس رجل سقط من ارتفاع",
     "People at Risk / Medical", "High", "طرابلس", True, "Medical / Rescue",
     "بلاغ عن إصابة خطيرة قرب دوار الشهداء في طرابلس تستوجب تدخل الإسعاف الفوري.", 5.5),

    ("حادث سير بين شاحنة وسيارتين على الطريق الدائري في طرابلس وفيه 3 مصابين والطريق شبه مسكر",
     "Road / Transportation", "High", "طرابلس", True, "Medical / Traffic Management",
     "حادث مروري بين شاحنة وسيارتين على الطريق الدائري بطرابلس خلّف ثلاثة مصابين وإغلاقاً جزئياً للطريق.", 6.0),

    ("سيول قوية في شارع الجمهورية في بنغازي دخلت المحلات والطوابق السفلية وفيه ناس ما قدروش يطلعوا",
     "Flood / Severe Weather", "High", "بنغازي", True, "Rescue / Traffic Management",
     "بلاغ عن سيول اجتاحت شارع الجمهورية في بنغازي وأحكمت حصار بعض السكان داخل مبانيهم.", 7.5),

    ("تسريب مياه كبير من أنبوب رئيسي غرق الطريق في سبها حي 11 يونيو وخطر على المارة",
     "Infrastructure / Utilities", "High", "سبها", False, "None",
     "بلاغ عن تسريب في أنبوب مياه رئيسي أغرق الطريق العام في حي 11 يونيو بسبها.", 9.0),

    ("أمطار غزيرة في غريان سببت انجراف جزء من الطريق الجبلي وأخاف السائقين",
     "Flood / Severe Weather", "High", "غريان", False, "Traffic Management",
     "بلاغ عن انجراف جزء من الطريق الجبلي في غريان إثر أمطار غزيرة تشكّل خطراً على السائقين.", 11.0),

    ("حريق في سيارة متوقفة في شارع بن غشير وامتد لعربية جنبها السائق نجا بسلامة",
     "Fire / Explosion", "High", "طرابلس", False, "Firefighting",
     "بلاغ عن حريق اشتعل في سيارة متوقفة بشارع بن غشير وامتد لمركبة مجاورة.", 13.0),

    ("طفل عمره 7 سنين ابتلع دواء من خزانة البيت في مدينة الخمس ومحتاجين مساعدة طبية عاجلة",
     "People at Risk / Medical", "High", "الخمس", True, "Medical / Rescue",
     "بلاغ عن طفل في السابعة من عمره ابتلع دواءً في الخمس حالة طارئة تستدعي رعاية طبية فورية.", 15.0),

    ("الطريق بين زليتن وتاورغاء فيه حفرة كبيرة قلبت منها سيارة وفيه جرحى",
     "Road / Transportation", "High", "زليتن", True, "Medical / Traffic Management",
     "بلاغ عن حفرة خطيرة تسببت في انقلاب سيارة على الطريق بين زليتن وتاورغاء مع وقوع جرحى.", 18.0),

    # ── Medium / yesterday ──
    ("انقطاع كهرباء مستمر منذ أمس في حي بن عاشور طرابلس وما فيه أي بيان من الشركة",
     "Infrastructure / Utilities", "Medium", "طرابلس", False, "None",
     "بلاغ عن انقطاع متكرر للكهرباء في حي بن عاشور دون بيان رسمي من الجهة المعنية.", 20.0),

    ("ازدحام شديد جداً في محور صيام بطرابلس بسبب إغلاق نفق وتحويل المرور بدون لافتات",
     "Road / Transportation", "Medium", "طرابلس", False, "Traffic Management",
     "بلاغ عن ازدحام مروري حاد في محور صيام بطرابلس جراء إغلاق نفق دون إشارات توجيهية.", 22.0),

    ("عاصفة رملية شديدة تضرب مدينة سبها والرؤية شبه صفر على الطرق الخارجية",
     "Flood / Severe Weather", "Medium", "سبها", False, "Traffic Management",
     "بلاغ عن عاصفة رملية حادة في سبها تحدّ من الرؤية على الطرق الخارجية.", 25.0),

    ("شخص مجهول الهوية عالق على سطح مبنى مهجور في درنة وبحاجة مساعدة للنزول",
     "People at Risk / Medical", "Medium", "درنة", True, "Rescue",
     "بلاغ عن شخص محاصر على سطح مبنى مهجور في درنة ويحتاج تدخلاً للإنقاذ.", 28.0),

    ("تشقق واضح في حائط مدرسة ابتدائية في الزاوية بعد هطول الأمطار واللمبات خربت كمان",
     "Other", "Medium", "الزاوية", False, "None",
     "بلاغ عن تشققات ظهرت في جدران مدرسة ابتدائية بالزاوية عقب هطول الأمطار مع تلف في الإضاءة.", 32.0),

    ("قطعة كهرباء متقطعة في مصراتة بسبب محول قديم في حي الكورنيش المشكلة متكررة",
     "Infrastructure / Utilities", "Medium", "مصراتة", False, "None",
     "بلاغ عن انقطاع متكرر للكهرباء في حي الكورنيش بمصراتة بسبب محول قديم.", 36.0),

    # ── High / two days ago ──
    ("انقطاع في شبكة المياه منذ 3 أيام في طبرق والناس ما عندهم ماء خالص",
     "Infrastructure / Utilities", "High", "طبرق", False, "None",
     "بلاغ عن انقطاع متواصل في إمدادات المياه لمدة ثلاثة أيام في طبرق يؤثر على قاطني المنطقة.", 44.0),

    ("اندلاع حريق في مخزن مواد بلاستيكية في المنطقة الصناعية بمصراتة والدخان الأسود كثيف",
     "Fire / Explosion", "High", "مصراتة", False, "Firefighting",
     "بلاغ عن حريق في مخزن مواد بلاستيكية بالمنطقة الصناعية بمصراتة يصدر عنه دخان أسود كثيف.", 50.0),

    ("مركبة قلبت في جنزور غرب طرابلس وفيه إصابتين متوسطتين",
     "Road / Transportation", "High", "جنزور", True, "Medical / Traffic Management",
     "بلاغ عن انقلاب مركبة في جنزور غرب طرابلس مع تسجيل إصابتين متوسطتين.", 54.0),

    ("فيضان درنة تسبب في سقوط ضحايا وتلوث محتمل لمياه الشرب والبحر",
     "Flood / Severe Weather", "Critical", "درنة", True, "Rescue",
     "بلاغ عن فيضان في درنة أسفر عن ضحايا وتلوث محتمل لمياه الشرب والبحر.", 58.0),

    # ── Medium-Low / three days ago ──
    ("ازدحام مروري في مدخل بني وليد بسبب حادث صغير وإغلاق المسار الأيسر جزئياً",
     "Road / Transportation", "Low", "بني وليد", False, "Traffic Management",
     "بلاغ عن ازدحام في مدخل بني وليد جراء حادث بسيط وإغلاق جزئي للمسار الأيسر.", 63.0),

    ("الانترنت ضعيف هلبا وشبكة الارضي واقفة كامل في قصر بن غشير",
     "Infrastructure / Utilities", "Medium", "قصر بن غشير", False, "None",
     "بلاغ عن انقطاع في شبكة الإنترنت الأرضي في قصر بن غشير يؤثر على الاتصالات.", 68.0),

    ("سقوط شجرة كبيرة على سيارتين في النوفليين اثناء العاصفة وفيه أشخاص عالقين",
     "Flood / Severe Weather", "High", "النوفليين", True, "Rescue",
     "بلاغ عن سقوط شجرة على سيارتين في النوفليين إثر عاصفة مع وجود أشخاص عالقين.", 72.0),

    ("في سيارة واقفة في شارع المعدات الطبية من شهرين وبتعوق الحركة",
     "Road / Transportation", "Low", "طرابلس", False, "Traffic Management",
     "بلاغ عن سيارة متروكة في شارع المعدات الطبية تعيق حركة المرور منذ شهرين.", 76.0),

    # ── Mix / four days ago ──
    ("حريق واسع في منطقة صناعية مع انتشار الدخان الى مناطق مجاورة في طرابلس",
     "Fire / Explosion", "Critical", "طرابلس", True, "Firefighting / Rescue",
     "بلاغ عن حريق واسع في منطقة صناعية بطرابلس ينتشر دخانه للمناطق المجاورة.", 90.0),

    ("اخلاء مواطنين عالقين نتيجة ارتفاع منسوب المياه في جنوب طرابلس",
     "Flood / Severe Weather", "Critical", "جنوب طرابلس", True, "Rescue",
     "بلاغ عن إخلاء مواطنين عالقين جراء ارتفاع منسوب المياه في جنوب طرابلس.", 96.0),

    ("انقطع الاتصال بمسن عمره 70 سنة من ما خرج من بيته في غريان",
     "People at Risk / Medical", "High", "غريان", True, "Rescue",
     "بلاغ عن انقطاع الاتصال بمسن في غريان لم يتواصل منذ مغادرته منزله.", 100.0),

    ("هبوط في الطريق عند هون وسكروا مسار واحد لين يتم الاصلاح",
     "Infrastructure / Utilities", "Medium", "هون", False, "None",
     "بلاغ عن هبوط في الطريق عند هون أفضى إلى إغلاق مسار لحين الإصلاح.", 108.0),

    ("عطل في محول كهربائي في تراغن قطع الكهرباء عن حي كامل",
     "Infrastructure / Utilities", "Medium", "تراغن", False, "None",
     "بلاغ عن عطل في محول كهربائي في تراغن أدى إلى انقطاع الكهرباء عن حي بأكمله.", 115.0),

    ("حالة طارئة في الزاوية ومحتاجين سيارة اسعاف باسرع وقت ممكن",
     "People at Risk / Medical", "Critical", "الزاوية", True, "Medical / Rescue",
     "بلاغ عن حالة طارئة في الزاوية تستدعي إرسال سيارة إسعاف بشكل عاجل.", 120.0),
]


def post_report(entry):
    text, incident_class, priority, location, people_at_risk, required_support, summary, _ = entry
    payload = {
        "originalText": text,
        "incidentClass": incident_class,
        "priority": priority,
        "location": location,
        "peopleAtRisk": people_at_risk,
        "requiredSupport": required_support,
        "summary": summary,
        "analysisTime": f"{random.uniform(1.3, 2.8):.1f}s",
    }
    resp = httpx.post(f"{BASE_URL}/api/reports", headers=HEADERS, json=payload, timeout=15)
    resp.raise_for_status()
    return resp.json()


def main():
    print(f"Seeding {len(REPORTS)} demo reports to {BASE_URL} …\n")
    ok = 0
    for i, entry in enumerate(REPORTS, 1):
        try:
            result = post_report(entry)
            print(f"  [{i:02d}] ✓  id={result.get('id')}  {entry[1]}  {entry[2]}  — {entry[3]}")
            ok += 1
        except Exception as exc:
            print(f"  [{i:02d}] ✗  {entry[0][:50]}…  →  {exc}")
        time.sleep(0.15)   # be gentle with the API

    print(f"\nDone: {ok}/{len(REPORTS)} reports inserted.")


if __name__ == "__main__":
    main()
