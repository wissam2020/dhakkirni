/* ذكّرني — تحليل الجملة: يطلّع المهمة والوقت والتكرار من الحكي
   Supports Lebanese/Levantine Arabic, MSA and French. */
(function (root) {
  'use strict';

  const B = '(?<=^|[\\s،,.!?])';        // word start
  const E = '(?=$|[\\s،,.!?])';         // word end

  const NUM_WORDS = [
    [/^(واحد|وحد[هة]|وحدي)$/, 1], [/^(تنين|اتنين|اثنين|اثنتين|ثنتين|تنتين)$/, 2],
    [/^(تلات[هة]?|ثلاث[هة]?|تلاتي)$/, 3], [/^(اربع[هة]?|اربعي)$/, 4],
    [/^(خمس[هة]?|خمسي)$/, 5], [/^(ست[هة]?|ستي)$/, 6], [/^(سبع[هة]?|سبعي)$/, 7],
    [/^(تماني[هة]?|ثماني[هة]?|تمان|ثمان)$/, 8], [/^(تسع[هة]?|تسعي)$/, 9],
    [/^(عشر[هة]?|عشري)$/, 10], [/^(حداعش|احداعش|احدعش|احدى عشر[هة]?|حدعش)$/, 11],
    [/^(تناعش|اتناعش|اثنا عشر|اثنتا عشر[هة]?|طنعش)$/, 12],
    [/^(un|une)$/, 1], [/^deux$/, 2], [/^trois$/, 3], [/^quatre$/, 4], [/^cinq$/, 5],
    [/^six$/, 6], [/^sept$/, 7], [/^huit$/, 8], [/^neuf$/, 9], [/^dix$/, 10],
    [/^onze$/, 11], [/^douze$/, 12], [/^quinze$/, 15], [/^vingt$/, 20], [/^trente$/, 30]
  ];
  const NUMW = '(?:واحد|وحد[هة]|تنين|اتنين|اثنين|ثنتين|تنتين|تلات[هة]?|ثلاث[هة]?|اربع[هة]?|خمس[هة]?|ست[هة]?|سبع[هة]?|تماني[هة]?|ثماني[هة]?|تمان|تسع[هة]?|عشر[هة]?|حداعش|احداعش|احدعش|حدعش|تناعش|اتناعش|طنعش|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente)';

  function wordToNum(w) {
    if (w == null) return null;
    w = String(w).trim();
    if (/^\d+$/.test(w)) return parseInt(w, 10);
    for (const [re, n] of NUM_WORDS) if (re.test(w)) return n;
    return null;
  }

  // Arabic weekday names → JS getDay() (0 = Sunday)
  const WEEKDAYS = [
    [/^(ال)?احد$/, 0], [/^(ال)?(اثنين|تنين|اتنين|اثنين)$/, 1], [/^(ال)?(ثلاثاء|تلات|تلاتا|تلاتاء)$/, 2],
    [/^(ال)?(اربعاء|اربعا|اربع)$/, 3], [/^(ال)?خميس$/, 4], [/^(ال)?جمع[هة]$/, 5], [/^(ال)?سبت$/, 6],
    [/^dimanche$/, 0], [/^lundi$/, 1], [/^mardi$/, 2], [/^mercredi$/, 3], [/^jeudi$/, 4], [/^vendredi$/, 5], [/^samedi$/, 6]
  ];
  const WD = '(?:(?:ال)?(?:احد|اثنين|تنين|اتنين|ثلاثاء|تلاتا|تلات|اربعاء|اربعا|خميس|جمع[هة]|سبت)|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)';
  function weekdayOf(w) {
    for (const [re, n] of WEEKDAYS) if (re.test(w)) return n;
    return null;
  }

  function normalize(s) {
    return String(s || '')
      .replace(/[ً-ْـ]/g, '')               // tashkeel + tatweel
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[’`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseReminder(input, nowArg) {
    const now = nowArg ? new Date(nowArg) : new Date();
    let s = normalize(input);
    let m;

    const take = (re) => {
      const mm = re.exec(s);
      if (!mm) return null;
      s = (s.slice(0, mm.index) + ' ' + s.slice(mm.index + mm[0].length)).replace(/\s+/g, ' ').trim();
      return mm;
    };

    let repeat = 'none';
    let dayOffset = null;      // days from today
    let weekday = null;        // 0..6
    let explicitDate = null;   // {d, m}
    let relMinutes = null;     // "after X"
    let hour = null, minute = 0, period = null;

    // ── 1. trigger words at the start
    take(new RegExp('^(?:لو سمحت\\s+)?(?:ذكرني|ذكريني|ذكرنا|فكرني|فكريني|نبهني|نبهيني|تذكير|بدي تذكرني|rappelle[- ]moi|rappel|n\'oublie pas)(?:\\s+(?:انو|انه|ان|اني|بانو|ب|بـ|de|que|:)(?=\\s)|\\s+(?:d\'|qu\'))?' + E, 'i'));

    // ── 2. repetition
    if ((m = take(new RegExp(B + '(?:كل (?:يوم )?(' + WD + ')|tous les (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?|chaque (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche))' + E, 'i')))) {
      const w = (m[1] || m[2] || m[3] || '').toLowerCase();
      // "كل جمعة" alone in Lebanese often = every week; treat as Friday anyway (weekly either way)
      repeat = 'weekly'; weekday = weekdayOf(w);
    }
    else if ((m = take(new RegExp(B + '(?:كل يوم|يوميا|كل نهار|كل ليل[هة]|tous les jours|chaque jour|quotidiennement)' + E, 'i')))) repeat = 'daily';
    else if ((m = take(new RegExp(B + '(?:كل اسبوع|كل جمع[هة]|اسبوعيا|chaque semaine|toutes les semaines)' + E, 'i')))) repeat = 'weekly';
    else if ((m = take(new RegExp(B + '(?:كل شهر|شهريا|tous les mois|chaque mois|mensuellement)' + E, 'i')))) repeat = 'monthly';

    // ── 3. relative: "بعد ساعتين", "بعد 10 دقايق", "dans 2 heures"
    const units = {
      min: '(?:دقيق[هة]|دقايق|دقائق|دقيقه|min|mins|minute|minutes)',
      min2: '(?:دقيقتين)',
      hr: '(?:ساع[هة]|ساعات|heure|heures|h)',
      hr2: '(?:ساعتين)',
      day: '(?:يوم|ايام|jour|jours)',
      day2: '(?:يومين)',
      wk: '(?:اسبوع|اسابيع|جمع[هة]|semaine|semaines)'
    };
    m = take(new RegExp(B + '(?:بعد|خلال|dans)\\s+(?:(\\d+|' + NUMW + '|ربع|نص|نصف)\\s+)?(' +
      units.min2 + '|' + units.hr2 + '|' + units.day2 + '|' + units.min + '|' + units.hr + '|' + units.day + '|' + units.wk +
      ')(?:\\s*(?:و\\s*نص|ونص|ونصف|et demie))?' + E, 'i'));
    if (m) {
      const raw = m[0];
      const qty = m[1];
      const unit = m[2].toLowerCase();
      let n = qty === 'ربع' ? 0.25 : (qty === 'نص' || qty === 'نصف') ? 0.5 : (qty ? wordToNum(qty) : 1);
      if (n == null) n = 1;
      if (/ونص|و نص|ونصف|et demie/.test(raw)) n += 0.5;
      if (new RegExp('^' + units.min2 + '$').test(unit)) relMinutes = 2;
      else if (new RegExp('^' + units.hr2 + '$').test(unit)) relMinutes = 120 + (n > 1 ? 0 : 0) + (/ونص|و نص|et demie/.test(raw) ? 30 : 0);
      else if (new RegExp('^' + units.day2 + '$').test(unit)) dayOffset = 2;
      else if (new RegExp('^' + units.min + '$', 'i').test(unit)) relMinutes = n;
      else if (new RegExp('^' + units.hr + '$', 'i').test(unit)) relMinutes = Math.round(n * 60);
      else if (new RegExp('^' + units.day + '$', 'i').test(unit)) dayOffset = n;
      else if (new RegExp('^' + units.wk + '$', 'i').test(unit)) dayOffset = n * 7;
    }

    // ── 4. day words
    if (dayOffset == null && relMinutes == null) {
      if (take(new RegExp(B + '(?:بعد بكر[اةه]|بعد بكرى|après-demain|apres-demain|après demain)' + E, 'i'))) dayOffset = 2;
      else if (take(new RegExp(B + '(?:بكر[اةه]|بكرى|غدا|غدوه|بالغد|demain)' + E, 'i'))) dayOffset = 1;
      else if (take(new RegExp(B + '(?:الليل[هة]|ce soir)' + E, 'i'))) { dayOffset = 0; period = 'pm'; }
      else if (take(new RegExp(B + '(?:اليوم|هلق|هلا|aujourd\'hui)' + E, 'i'))) dayOffset = 0;
    }
    if (weekday == null && dayOffset == null && relMinutes == null) {
      m = take(new RegExp(B + '(?:(?:يوم|نهار|le|ce)\\s+)?(' + WD + ')(?:\\s+(?:الجاي|الجايي|الجايه|القادم|prochain))?' + E, 'i'));
      if (m) weekday = weekdayOf(m[1].toLowerCase());
    }
    // explicit date: 15/10, 15-10, le 15
    m = take(new RegExp(B + '(?:ب|في|le\\s+)?(\\d{1,2})[/\\-.](\\d{1,2})(?:[/\\-.](\\d{2,4}))?' + E, 'i'));
    if (m) explicitDate = { d: +m[1], m: +m[2], y: m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null };

    // ── 5. time of day
    // "الساعه 5 ونص", "عالساعه خمسه", "5:30", "à 10h30", "10h"
    const FRAC = '(?:\\s*(و\\s*نص|ونص|ونصف|وربع|و ربع|الا ربع|الا ثلث|وتلت|et demie|et quart|moins le quart))?';
    const PERIOD_AHEAD = '(?=\\s*(?:ال|بال|عال)?(?:صبح|صباح|ضهر|ظهر|عصر|مسا|مساء|ليل|du matin|du soir|de l))';
    let timeMatched = false;
    // A) with a prefix: "الساعه 5", "عالساعه 8:30", "à 10h"
    m = take(new RegExp(B + '(?:(?:ع|على|عال|ع ال|ب|بال)?\\s*الساع[هة]|عالساع[هة]|à|a|vers)\\s+(\\d{1,2})(?:\\s*[:h.]\\s*(\\d{2}))?\\s*h?' + FRAC + E, 'i'));
    // B) with a separator: "5:30", "10h", "10h30"
    if (!m) m = take(new RegExp(B + '(\\d{1,2})\\s*(?:[:h]\\s*(\\d{2})?)' + FRAC + E, 'i'));
    // C) followed by a period word: "8 الصبح", "5 ونص المسا"
    if (!m) m = take(new RegExp(B + '(\\d{1,2})()' + FRAC + PERIOD_AHEAD, 'i'));
    if (m && +m[1] <= 24) {
      hour = +m[1]; minute = m[2] ? +m[2] : 0; timeMatched = true;
      applyFraction(m[3]);
    }
    if (!timeMatched) {
      m = take(new RegExp(B + '(?:(?:ع|على|عال|ب|بال)?\\s*الساع[هة]|عالساع[هة])\\s+(' + NUMW + ')(?:\\s*(و\\s*نص|ونص|ونصف|وربع|و ربع|الا ربع|et demie|et quart|moins le quart))?' + E, 'i'));
      if (m) { hour = wordToNum(m[1]); minute = 0; timeMatched = true; applyFraction(m[2]); }
    }
    function applyFraction(f) {
      if (!f) return;
      if (/نص|demie/.test(f)) minute = 30;
      else if (/الا ربع|moins le quart/.test(f)) { minute = 45; hour = hour - 1; if (hour < 0) hour = 23; }
      else if (/ربع|quart/.test(f)) minute = 15;
      else if (/الا ثلث/.test(f)) { minute = 40; hour = hour - 1; }
      else if (/تلت/.test(f)) minute = 20;
    }

    // periods
    if (take(new RegExp(B + '(?:ال)?(?:صبح|صباح|صباحا|عالصبح|الصبحي[هة]|du matin|le matin|matin)' + E, 'i'))) period = 'am';
    else if (take(new RegExp(B + '(?:ال|بال|ع ال)?(?:ضهر|ظهر|ظهرا|midi)' + E, 'i'))) period = 'noon';
    else if (take(new RegExp(B + '(?:ال|بال)?(?:عصر|عصرا|بعد الظهر|بعد الضهر|de l\'après-midi|l\'après-midi|aprem)' + E, 'i'))) period = 'pm';
    else if (take(new RegExp(B + '(?:ال|بال|عال)?(?:مسا|مساء|مساءا|عشي[هة]|ليل|du soir|le soir|soir)' + E, 'i'))) period = 'pm';
    else if (take(new RegExp(B + '(?:minuit|نص الليل|منتصف الليل)' + E, 'i'))) { hour = 0; minute = 0; timeMatched = true; }

    if (period === 'noon' && hour == null) { hour = 12; minute = 0; timeMatched = true; }

    // ── 6. build the date
    let at = null, confident = true;
    const target = new Date(now);
    target.setSeconds(0, 0);

    if (relMinutes != null) {
      at = new Date(now.getTime() + relMinutes * 60000);
      at.setSeconds(0, 0);
    } else {
      let explicitDay = false;
      if (explicitDate) {
        target.setMonth(explicitDate.m - 1, explicitDate.d);
        if (explicitDate.y) target.setFullYear(explicitDate.y);
        else if (target < startOfDay(now)) target.setFullYear(target.getFullYear() + 1);
        explicitDay = true;
      } else if (dayOffset != null) {
        target.setDate(target.getDate() + dayOffset); explicitDay = true;
      } else if (weekday != null) {
        let diff = (weekday - now.getDay() + 7) % 7;
        target.setDate(target.getDate() + diff); explicitDay = true;
        if (diff === 0) explicitDay = 'sameWeekday';
      }

      if (hour != null) {
        if (period === 'am') { if (hour === 12) hour = 0; }
        else if (period === 'pm' || period === 'noon') { if (hour < 12 && !(period === 'noon' && hour >= 11)) hour += 12; }
        else if (hour >= 1 && hour <= 6) hour += 12;          // "الساعة 5" = 5 المسا
        target.setHours(hour, minute, 0, 0);
        if (target <= now) {
          if (explicitDay === true && dayOffset === 0 && hour < 12 && period == null) target.setHours(hour + 12);
          else if (explicitDay === 'sameWeekday') target.setDate(target.getDate() + 7);
          else if (!explicitDay) {
            if (hour < 12 && period == null && new Date(target.getTime() + 12 * 3600000) > now) target.setHours(hour + 12);
            else target.setDate(target.getDate() + 1);
          }
        }
        at = target;
      } else if (explicitDay) {
        const defH = period === 'am' ? 9 : period === 'pm' ? 18 : 9;
        target.setHours(defH, 0, 0, 0);
        if (target <= now) {
          if (explicitDay === 'sameWeekday') target.setDate(target.getDate() + 7);
          else if (dayOffset === 0) { target.setTime(now.getTime() + 3600000); target.setSeconds(0, 0); }
        }
        at = target;
      } else if (period) {
        target.setHours(period === 'am' ? 9 : period === 'noon' ? 12 : 18, 0, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        at = target;
      } else if (repeat !== 'none') {
        target.setHours(9, 0, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        at = target;
      } else {
        confident = false;
        at = new Date(now.getTime() + 3600000); at.setSeconds(0, 0);
      }
    }

    if (repeat === 'weekly' && weekday != null && at) {
      while (at.getDay() !== weekday) at.setDate(at.getDate() + 1);
      if (at <= now) at.setDate(at.getDate() + 7);
    }

    // ── 7. clean the task text
    let task = s
      .replace(/^(?:انو|انه|ان|اني|ب|بـ|de|d'|que|qu'|à|a|:|-|،|,)\s+/i, '')
      .replace(/\s+(?:انو|ب|بـ|و|de|à|et)$/i, '')
      .replace(/^[\s،,.:\-]+|[\s،,.:\-]+$/g, '')
      .trim();
    if (task) task = task.charAt(0).toUpperCase() + task.slice(1);

    return { task: task || normalize(input), at: at ? at.toISOString() : null, repeat, confident };
  }

  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  root.parseReminder = parseReminder;
  if (typeof module !== 'undefined') module.exports = { parseReminder, normalize };
})(typeof window !== 'undefined' ? window : globalThis);
