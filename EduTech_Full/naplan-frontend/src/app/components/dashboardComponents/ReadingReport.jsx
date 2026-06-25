/**
 * ReadingReport.jsx
 *
 * NAPLAN-aligned dashboard body for READING attempts only.
 * Rendered by Dashboard.jsx in place of the generic grid when the result is Reading.
 *
 *  - Leads with an INDICATIVE proficiency level (not an official NAPLAN result).
 *  - NEVER shows passage names — texts are labelled "Text 1, Text 2, …".
 *  - Width is capped and centred so it reads like a report, not a stretched grid.
 *  - Comprehension-skills panel fills in once questions carry a `skill` tag
 *    (result.skillBreakdown); until then it shows a clear "unlocks" state.
 */
import {
  Clock,
  RefreshCw,
  ShieldAlert,
  BookOpen,
  Target,
  Search,
  Lightbulb,
  GraduationCap,
  CheckCircle2,
  Timer,
  ArrowUpRight,
} from "lucide-react";

/* ── Indicative proficiency mapping (tune thresholds here) ── */
const PROFICIENCY_LEVELS = [
  {
    key: "needs",
    label: "Needs additional support",
    descriptor: "Below the expected standard.",
    text: "text-rose-600",
    bar: "bg-rose-400",
    next: {
      targetLabel: "Developing",
      points: [
        "Start with the 'find the fact' questions — the answer is stated in the text.",
        "Reread each question slowly before choosing an answer.",
      ],
    },
  },
  {
    key: "developing",
    label: "Developing",
    descriptor: "Working towards the expected standard.",
    text: "text-amber-600",
    bar: "bg-amber-400",
    next: {
      targetLabel: "Strong",
      points: [
        "Practise inference: ask 'why' a character felt or did something.",
        "Check every answer option back against the text before deciding.",
      ],
    },
  },
  {
    key: "strong",
    label: "Strong",
    descriptor: "At the expected standard for this year level.",
    text: "text-emerald-600",
    bar: "bg-emerald-400",
    next: {
      targetLabel: "Exceeding",
      points: [
        "Compare and connect ideas across different paragraphs.",
        "Justify each answer with evidence you can point to in the text.",
      ],
    },
  },
  {
    key: "exceeding",
    label: "Exceeding",
    descriptor: "Above the expected standard.",
    text: "text-blue-600",
    bar: "bg-blue-400",
    next: {
      targetLabel: "Keep it up",
      points: [
        "Tackle longer, more complex texts to stay challenged.",
        "Explain your reasoning in full sentences, not just the answer.",
      ],
    },
  },
];

const proficiencyFromPercent = (pct) => {
  const p = Number(pct) || 0;
  if (p < 35) return { ...PROFICIENCY_LEVELS[0], idx: 0 };
  if (p < 60) return { ...PROFICIENCY_LEVELS[1], idx: 1 };
  if (p < 85) return { ...PROFICIENCY_LEVELS[2], idx: 2 };
  return { ...PROFICIENCY_LEVELS[3], idx: 3 };
};

/* difficulty of a single text from its score */
const textBand = (pct) => {
  if (pct >= 75) return { label: "Easier", dot: "bg-emerald-500", text: "text-emerald-600" };
  if (pct >= 50) return { label: "Medium", dot: "bg-amber-500", text: "text-amber-600" };
  return { label: "Harder", dot: "bg-rose-500", text: "text-rose-600" };
};

/* per-text rows — uses the real sub-topic / text name from the key */
const buildTextRows = (topicBreakdown = {}) =>
  Object.entries(topicBreakdown)
    .map(([name, v], i) => {
      const total = Number(v?.total) || 0;
      const scored = Number(v?.scored) || 0;
      const pct = total ? Math.round((scored / total) * 100) : 0;
      return { n: i + 1, name: String(name || `Text ${i + 1}`), scored, total, pct, band: textBand(pct) };
    })
    .filter((r) => r.total > 0);

/* roll the text rows into the three tiers */
const tiersFromRows = (rows) => {
  let didWell = 0, nearly = 0, tricky = 0;
  rows.forEach((r) => {
    if (r.pct >= 75) didWell++;
    else if (r.pct >= 50) nearly++;
    else tricky++;
  });
  return { didWell, nearly, tricky, total: rows.length };
};

/* strip passage names out of AI tip text */
const makeNameFilter = (topicBreakdown = {}) => {
  const names = Object.keys(topicBreakdown).map((n) => String(n).toLowerCase());
  const stop = new Set(["the", "and", "with", "your", "from", "that", "this", "passage", "reading"]);
  const tokens = new Set();
  names.forEach((nm) =>
    nm.split(/[^a-z]+/).forEach((t) => {
      if (t.length >= 4 && !stop.has(t)) tokens.add(t);
    })
  );
  return (s) => {
    const low = String(s || "").toLowerCase();
    if (names.some((n) => n && low.includes(n))) return true;
    return [...tokens].some((t) => new RegExp(`\\b${t}\\b`).test(low));
  };
};

const DEFAULT_TIPS = [
  "Read carefully — slow down on the longer texts.",
  "Reread the question, then find the part of the text that answers it.",
  "Practise a short passage every day to build comprehension.",
];

const buildNextSteps = (feedback, topicBreakdown) => {
  const hasName = makeNameFilter(topicBreakdown);
  const clean = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((x) => String(x || "").trim())
      .filter((x) => x && !hasName(x));
  let tips = clean(feedback?.study_tips);
  if (tips.length < 3) tips = tips.concat(clean(feedback?.weaknesses));
  const seen = new Set();
  const out = [];
  for (const t of tips.concat(DEFAULT_TIPS)) {
    const key = t.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 3).join(" ");
    if (key && !seen.has(key)) { seen.add(key); out.push(t); }
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
};

const READING_SKILLS = [
  "Locating information",
  "Interpreting meaning",
  "Making inferences",
  "Evaluating & reflecting",
];

const StatCard = ({ icon: Icon, iconColor, label, value, valueColor, sub, tint = "bg-white border-slate-100" }) => (
  <div className={`${tint} rounded-xl shadow-sm border p-3 flex flex-col items-center justify-center gap-1 min-h-20`}>
    <div className="flex items-center gap-1.5 mb-0.5">
      <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
    <p className={`text-lg font-bold text-center leading-tight ${valueColor}`}>{value}</p>
    {sub ? <p className="text-[10px] text-slate-400 font-medium text-center">{sub}</p> : null}
  </div>
);

/* soft section tints so the cards don't read as a wall of white */
const ACCENTS = {
  white: "bg-white border-slate-100",
  rose: "bg-rose-50 border-rose-100",
  emerald: "bg-emerald-50 border-emerald-100",
  indigo: "bg-indigo-50 border-indigo-100",
  sky: "bg-sky-50 border-sky-100",
  violet: "bg-violet-50 border-violet-100",
  amber: "bg-amber-50 border-amber-100",
};

const Card = ({ children, accent = "white", className = "" }) => (
  <div className={`${ACCENTS[accent] || ACCENTS.white} rounded-xl shadow-sm border p-5 ${className}`}>{children}</div>
);

const SectionHead = ({ icon: Icon, color, title, sub }) => (
  <>
    <div className="flex items-center gap-2 mb-1">
      <Icon className={`w-4 h-4 ${color}`} />
      <p className="text-base font-semibold text-slate-800">{title}</p>
    </div>
    {sub ? <p className="text-xs text-slate-600 mb-4">{sub}</p> : null}
  </>
);

export default function ReadingReport({
  result,
  percentage = 0,
  duration = "—",
  attemptsUsed = "—",
  violations = 0,
  yearLevel = null,
  feedback = null,
}) {
  const topicBreakdown = result?.topicBreakdown || {};
  const prof = proficiencyFromPercent(percentage);
  const rows = buildTextRows(topicBreakdown);
  const tiers = tiersFromRows(rows);
  const nextSteps = buildNextSteps(feedback || result?.ai_feedback, topicBreakdown);
  const skillBreakdown = result?.skillBreakdown || result?.skill_breakdown || null;
  const hasSkills = skillBreakdown && Object.keys(skillBreakdown).length > 0;

  const totalQuestions = rows.reduce((a, r) => a + r.total, 0);
  const totalCorrect = rows.reduce((a, r) => a + r.scored, 0);
  const rawSeconds = Number(result?.duration) || 0;
  const pace = totalQuestions > 0 && rawSeconds > 0 ? `${Math.round(rawSeconds / totalQuestions)}s` : "—";

  const tierRows = [
    { label: "Did well", sub: "got most right", count: tiers.didWell, dot: "bg-emerald-500", bar: "bg-emerald-400" },
    { label: "Nearly there", sub: "about half right", count: tiers.nearly, dot: "bg-amber-500", bar: "bg-amber-400" },
    { label: "Found tricky", sub: "needs more practice", count: tiers.tricky, dot: "bg-rose-500", bar: "bg-rose-400" },
  ];

  return (
    <div className="px-6 py-3">
      <div className="w-full space-y-4">

        {/* Stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard icon={GraduationCap} iconColor="text-indigo-400" label="Reading Level" value={prof.label} valueColor={prof.text} sub={`${Math.round(percentage)}% practice score`} tint="bg-indigo-50 border-indigo-100" />
          <StatCard icon={Clock} iconColor="text-sky-400" label="Time Spent" value={duration} valueColor="text-sky-600" tint="bg-sky-50 border-sky-100" />
          <StatCard icon={BookOpen} iconColor="text-emerald-400" label="Texts Read" value={tiers.total} valueColor="text-emerald-600" tint="bg-emerald-50 border-emerald-100" />
          <StatCard icon={RefreshCw} iconColor="text-violet-400" label="Attempts Used" value={attemptsUsed} valueColor="text-violet-600" tint="bg-violet-50 border-violet-100" />
          <StatCard icon={ShieldAlert} iconColor="text-rose-400" label="Violations" value={violations} valueColor={violations > 0 ? "text-rose-600" : "text-slate-400"} tint={violations > 0 ? "bg-rose-50 border-rose-100" : "bg-white border-slate-100"} />
        </div>

        {/* Proficiency scale */}
        <Card accent="indigo">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Reading proficiency <span className="text-slate-400 normal-case font-medium">(indicative)</span>
          </p>
          <p className={`text-2xl font-bold ${prof.text} mb-1`}>{prof.label}</p>
          <p className="text-sm text-slate-500 mb-5 leading-relaxed">{prof.descriptor}</p>

          <div className="relative grid grid-cols-4 gap-1.5">
            {PROFICIENCY_LEVELS.map((lvl, i) => (
              <div key={lvl.key} className={`h-3 rounded ${lvl.bar} ${i === prof.idx ? "" : "opacity-30"} ${i === 2 ? "ring-2 ring-emerald-600 ring-offset-2" : ""}`} />
            ))}
            <div className="absolute -top-7 -translate-x-1/2" style={{ left: `${prof.idx * 25 + 12.5}%` }}>
              <span className={`text-[10px] font-semibold ${prof.text} whitespace-nowrap`}>You are here</span>
              <div className="flex justify-center">
                <svg width="12" height="7" viewBox="0 0 12 7" className={prof.text} fill="currentColor"><path d="M6 7L0 0h12z" /></svg>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5 mt-2">
            <span className="text-[11px] text-slate-500 text-center">Needs support</span>
            <span className="text-[11px] text-slate-500 text-center">Developing</span>
            <span className="text-[11px] text-slate-500 text-center">Strong (expected)</span>
            <span className="text-[11px] text-slate-500 text-center">Exceeding</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
            Indicative practice estimate — not an official NAPLAN result.
          </p>
        </Card>
        {/* Row: reading at a glance + next milestone */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* Reading at a glance */}
          <Card accent="sky">
            <SectionHead icon={CheckCircle2} color="text-sky-500" title="Reading at a glance" sub="The numbers from this attempt" />
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-bold text-slate-800">{totalCorrect}</span>
              <span className="text-lg text-slate-400">/ {totalQuestions}</span>
              <span className="text-sm text-slate-500">questions correct</span>
            </div>
            <div className="h-2.5 rounded bg-slate-100 overflow-hidden mb-4">
              <div className="h-full rounded bg-sky-400" style={{ width: `${totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border border-slate-100">
                <p className="text-xs text-slate-500 mb-1">Accuracy</p>
                <p className="text-xl font-bold text-slate-800">{Math.round(percentage)}%</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <Timer className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xs text-slate-500">Avg per question</p>
                </div>
                <p className="text-xl font-bold text-slate-800">{pace}</p>
              </div>
            </div>
          </Card>

          {/* Next milestone */}
          <Card accent="violet">
            <SectionHead icon={ArrowUpRight} color="text-violet-500" title="Your next milestone"
              sub={prof.next.targetLabel === "Keep it up" ? "Stay challenged" : `Aim for "${prof.next.targetLabel}"`} />
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-sm font-semibold ${prof.text}`}>{prof.label}</span>
              <span className="text-slate-300">→</span>
              <span className="text-sm font-semibold text-emerald-600">{prof.next.targetLabel}</span>
            </div>
            {prof.next.points.map((p, i) => (
              <div key={i} className="flex items-start gap-2.5 mb-2.5 last:mb-0">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                <span className="text-sm text-slate-700 leading-relaxed">{p}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Row: texts breakdown + comprehension skills */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">

          {/* How you went across the texts */}
          <Card accent="emerald">
            <SectionHead icon={BookOpen} color="text-emerald-500" title="How you went across the texts"
              sub={`${tiers.total} reading ${tiers.total === 1 ? "text" : "texts"}, grouped by how you did`} />

            <div className="flex h-3 rounded overflow-hidden bg-slate-100 mb-3">
              {tierRows.map((r) => r.count > 0 ? (
                <div key={r.label} className={r.bar} style={{ width: `${(r.count / Math.max(tiers.total, 1)) * 100}%` }} />
              ) : null)}
            </div>

            {tierRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2 border-t border-slate-100">
                <span className="text-sm text-slate-700 flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${r.count ? r.dot : "bg-slate-300"}`} />
                  <span className={r.count ? "" : "text-slate-400"}>{r.label}</span>
                  <span className="text-xs text-slate-400">— {r.sub}</span>
                </span>
                <span className={`text-sm font-semibold ${r.count ? "text-slate-700" : "text-slate-400"}`}>
                  {r.count} {r.count === 1 ? "text" : "texts"}
                </span>
              </div>
            ))}

            {/* per-text detail (no names) */}
            <p className="text-xs font-semibold text-slate-500 mt-4 mb-2">Each text</p>
            <div className="space-y-1.5">
              {rows.map((r) => (
                <div key={r.n} className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.band.dot}`} />
                  <span className="text-sm text-slate-600 w-36 flex-shrink-0 truncate" title={r.name}>{r.name}</span>
                  <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded ${r.band.dot}`} style={{ width: `${r.pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-500 w-20 text-right flex-shrink-0">{r.scored}/{r.total} · {r.band.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Comprehension skills */}
          <Card>
            <SectionHead icon={Target} color="text-indigo-500" title="Reading comprehension skills"
              sub={hasSkills ? "How you did on each kind of reading question" : "Unlocks once reading questions are tagged by skill. Here's what it will show:"} />

            {hasSkills ? (
              Object.entries(skillBreakdown).map(([skill, v]) => {
                const total = Number(v?.total) || 0;
                const scored = Number(v?.scored) || 0;
                const pct = total ? Math.round((scored / total) * 100) : 0;
                const color = pct >= 75 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-rose-400";
                return (
                  <div key={skill} className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700">{skill}</span>
                      <span className="text-xs font-semibold text-slate-500">{pct}%</span>
                    </div>
                    <div className="h-2 rounded bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <>
                {READING_SKILLS.map((s) => (
                  <div key={s} className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700">{s}</span>
                      <span className="text-xs font-semibold text-slate-500">—</span>
                    </div>
                    <div className="h-2 rounded bg-slate-200" />
                  </div>
                ))}
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Add a <code className="text-slate-700 font-semibold">skill</code> tag to each reading question and this panel shows
                  strengths and gaps by comprehension skill — the NAPLAN-aligned view.
                </p>
              </>
            )}
          </Card>
        </div>


        {/* What to work on next */}
        <Card accent="amber">
          <SectionHead icon={Lightbulb} color="text-amber-500" title="What to work on next" />
          {nextSteps.map((tip, i) => (
            <div key={i} className="flex items-start gap-2.5 mb-2.5 last:mb-0">
              <span className="mt-0.5 text-indigo-500 flex-shrink-0">
                {i === 0 ? <Target className="w-4 h-4" /> : i === 1 ? <Search className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
              </span>
              <span className="text-sm text-slate-700 leading-relaxed">{tip}</span>
            </div>
          ))}
        </Card>

      </div>
    </div>
  );
}