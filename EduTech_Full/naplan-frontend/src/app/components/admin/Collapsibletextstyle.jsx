/**
 * CollapsibleTextStyle.jsx
 *
 * Drop this component into QuizDetailPage.jsx (or QuizDetailModal.jsx).
 *
 * FEATURES:
 *   ✅ Font size — slider + quick presets
 *   ✅ Font family — 6 choices with live label
 *   ✅ Font weight — Light / Normal / Medium / Bold / Extra Bold
 *   ✅ Text alignment — Left / Center / Right / Justify
 *   ✅ Line height — slider + presets
 *   ✅ Letter spacing — slider + presets
 *   ✅ Text color — 12 swatches + hex input
 *   ✅ Max characters — for writing / short_answer questions
 *   ✅ Apply-to scope — question text / options / explanation
 *   ✅ Live preview — shows all active styles together
 *   ✅ Active-tag summary bar when collapsed
 *   ✅ One-click reset per section
 *
 * USAGE:
 *   import CollapsibleTextStyle from "./CollapsibleTextStyle";
 *   // inside QuestionEditor JSX, after CollapsibleImageResize:
 *   <CollapsibleTextStyle form={form} setForm={setForm} />
 *
 * FORM FIELDS READ/WRITTEN:
 *   text_font_size      — number | null   (px)
 *   text_font_family    — string | null
 *   text_font_weight    — string | null   ("300"|"400"|"500"|"700"|"900")
 *   text_align          — string | null   ("left"|"center"|"right"|"justify")
 *   text_line_height    — number | null   (e.g. 1.4)
 *   text_letter_spacing — number | null   (px)
 *   text_color          — string | null   (hex)
 *   max_length          — number | null
 *   text_style_scope    — string | null   ("question"|"options"|"explanation"|"all")
 *
 * CARD VIEW — apply styles like this:
 *
 *   const txtStyle = buildTextStyle(q);   // helper exported below
 *   const optStyle = q.text_style_scope === "options" || q.text_style_scope === "all"
 *                    ? buildTextStyle(q) : {};
 *
 *   function buildTextStyle(q) {
 *     return {
 *       fontSize:      q.text_font_size   ? `${q.text_font_size}px` : undefined,
 *       fontFamily:    q.text_font_family  || undefined,
 *       fontWeight:    q.text_font_weight  || undefined,
 *       textAlign:     q.text_align        || undefined,
 *       lineHeight:    q.text_line_height  || undefined,
 *       letterSpacing: q.text_letter_spacing ? `${q.text_letter_spacing}px` : undefined,
 *       color:         q.text_color        || undefined,
 *     };
 *   }
 *
 * BACKEND — add these fields to your PATCH /api/admin/questions/:id handler:
 *   text_font_size, text_font_family, text_font_weight, text_align,
 *   text_line_height, text_letter_spacing, text_color,
 *   max_length, text_style_scope
 *
 * Add them to QuestionEditor's form state initialiser:
 *   text_font_size:      question.text_font_size      ?? null,
 *   text_font_family:    question.text_font_family     || null,
 *   text_font_weight:    question.text_font_weight     || null,
 *   text_align:          question.text_align            || null,
 *   text_line_height:    question.text_line_height     ?? null,
 *   text_letter_spacing: question.text_letter_spacing  ?? null,
 *   text_color:          question.text_color            || null,
 *   max_length:          question.max_length            ?? null,
 *   text_style_scope:    question.text_style_scope      || "question",
 *
 * And include them in handleSave's payload:
 *   text_font_size, text_font_family, text_font_weight, text_align,
 *   text_line_height, text_letter_spacing, text_color,
 *   max_length, text_style_scope
 */

import { useState } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const FONTS = [
  { label: "System Default",  value: "" },
  { label: "Sans-serif",      value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif",           value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace",       value: "ui-monospace, 'Courier New', monospace" },
  { label: "Rounded (Nunito)",value: "'Nunito', 'Varela Round', sans-serif" },
  { label: "Humanist (Gill)", value: "'Gill Sans', Optima, sans-serif" },
];

const FONT_WEIGHTS = [
  { label: "Light",      value: "300" },
  { label: "Normal",     value: "400" },
  { label: "Medium",     value: "500" },
  { label: "Bold",       value: "700" },
  { label: "Extra Bold", value: "900" },
];

const ALIGN_OPTIONS = [
  { label: "←",  value: "left",    title: "Left"    },
  { label: "≡",  value: "center",  title: "Center"  },
  { label: "→",  value: "right",   title: "Right"   },
  { label: "⟺", value: "justify", title: "Justify" },
];

const SCOPE_OPTIONS = [
  { label: "Question text",   value: "question"    },
  { label: "Options / Answers", value: "options"   },
  { label: "Explanation",     value: "explanation" },
  { label: "All text",        value: "all"         },
];

const COLOR_SWATCHES = [
  { label: "White",       value: "#ffffff" },
  { label: "Slate 100",   value: "#f1f5f9" },
  { label: "Slate 300",   value: "#cbd5e1" },
  { label: "Slate 400",   value: "#94a3b8" },
  { label: "Sky",         value: "#38bdf8" },
  { label: "Cyan",        value: "#22d3ee" },
  { label: "Emerald",     value: "#34d399" },
  { label: "Amber",       value: "#fbbf24" },
  { label: "Orange",      value: "#fb923c" },
  { label: "Rose",        value: "#fb7185" },
  { label: "Violet",      value: "#a78bfa" },
  { label: "Pink",        value: "#f472b6" },
];

// ─── Small helpers ────────────────────────────────────────────────────────────
function Tag({ color = "indigo", children, onRemove }) {
  const palettes = {
    indigo: "bg-indigo-500/15 text-indigo-300 border-indigo-500/25",
    cyan:   "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
    violet: "bg-violet-500/15 text-violet-300 border-violet-500/25",
    emerald:"bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    amber:  "bg-amber-500/15 text-amber-300 border-amber-500/25",
    pink:   "bg-pink-500/15 text-pink-300 border-pink-500/25",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${palettes[color]}`}>
      {children}
      {onRemove && (
        <button onClick={onRemove} className="opacity-60 hover:opacity-100 leading-none ml-0.5">✕</button>
      )}
    </span>
  );
}

function SectionHeader({ title, onReset, hasValue }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{title}</p>
      {hasValue && (
        <button onClick={onReset} className="text-[10px] text-slate-600 hover:text-red-400 transition">
          Reset
        </button>
      )}
    </div>
  );
}

// ─── buildTextStyle helper (also exported for card view) ─────────────────────
export function buildTextStyle(q) {
  return {
    fontSize:      q.text_font_size      ? `${q.text_font_size}px`      : undefined,
    fontFamily:    q.text_font_family    || undefined,
    fontWeight:    q.text_font_weight    || undefined,
    textAlign:     q.text_align          || undefined,
    lineHeight:    q.text_line_height    || undefined,
    letterSpacing: q.text_letter_spacing ? `${q.text_letter_spacing}px` : undefined,
    color:         q.text_color          || undefined,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CollapsibleTextStyle({ form, setForm }) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(form.text_color || "");
  const [activeTab, setActiveTab] = useState("typography"); // "typography" | "spacing" | "color" | "limits"

  // ── Active style tags for collapsed summary ──
  const activeTags = [
    form.text_font_size      && { color: "cyan",    label: `${form.text_font_size}px` },
    form.text_font_weight    && { color: "violet",  label: FONT_WEIGHTS.find(w => w.value === form.text_font_weight)?.label || form.text_font_weight },
    form.text_align          && { color: "emerald", label: form.text_align },
    form.text_line_height    && { color: "amber",   label: `lh ${form.text_line_height}` },
    form.text_letter_spacing && { color: "indigo",  label: `ls ${form.text_letter_spacing}px` },
    form.text_color          && { color: "pink",    label: form.text_color },
    form.max_length          && { color: "amber",   label: `≤${form.max_length} ch` },
    form.text_font_family    && { color: "cyan",    label: FONTS.find(f => f.value === form.text_font_family)?.label || "Custom font" },
  ].filter(Boolean);

  const hasAnyStyle = activeTags.length > 0;

  const resetAll = () => {
    setForm(f => ({
      ...f,
      text_font_size: null,
      text_font_family: null,
      text_font_weight: null,
      text_align: null,
      text_line_height: null,
      text_letter_spacing: null,
      text_color: null,
      max_length: null,
      text_style_scope: "question",
    }));
    setHexInput("");
  };

  // ── Collapsed state ──────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-xs text-slate-400 hover:text-white hover:border-slate-600 transition group"
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-sm flex-shrink-0">🔤</span>
          <span className="text-slate-500 group-hover:text-slate-300 transition flex-shrink-0">Text Style</span>
          {hasAnyStyle
            ? activeTags.map((t, i) => <Tag key={i} color={t.color}>{t.label}</Tag>)
            : <span className="text-slate-600 text-[10px]">Default — click to customise</span>
          }
        </div>
        <span className="text-slate-600 text-[10px] flex-shrink-0 ml-2">▼</span>
      </button>
    );
  }

  // ── Expanded state ───────────────────────────────────────────────────────
  return (
    <div className="bg-slate-900/70 border border-slate-700 rounded-xl overflow-hidden">

      {/* ── Panel header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-base">🔤</span>
          <p className="text-xs font-semibold text-white">Text Style</p>
          {hasAnyStyle && (
            <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 text-[9px] font-bold rounded-full border border-indigo-500/25">
              {activeTags.length} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasAnyStyle && (
            <button onClick={resetAll} className="text-[10px] text-slate-500 hover:text-red-400 transition">
              Reset all
            </button>
          )}
          <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white transition text-sm leading-none">✕</button>
        </div>
      </div>

      {/* ── Scope selector ── */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-800/60">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Apply styles to</p>
        <div className="flex flex-wrap gap-1.5">
          {SCOPE_OPTIONS.map((s) => (
            <button key={s.value} type="button"
              onClick={() => setForm(f => ({ ...f, text_style_scope: s.value }))}
              className={`px-3 py-1 text-[10px] font-medium rounded-lg border transition ${
                (form.text_style_scope || "question") === s.value
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white"
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-slate-800">
        {[
          { id: "typography", icon: "Aa",  label: "Typography" },
          { id: "spacing",    icon: "↕↔",  label: "Spacing"    },
          { id: "color",      icon: "🎨",  label: "Color"      },
          { id: "limits",     icon: "📏",  label: "Limits"     },
        ].map((tab) => (
          <button key={tab.id} type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-[10px] font-semibold tracking-wide transition flex items-center justify-center gap-1.5 ${
              activeTab === tab.id
                ? "text-white border-b-2 border-indigo-500 bg-indigo-500/5"
                : "text-slate-500 hover:text-slate-300"
            }`}>
            <span className="text-xs">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="p-4 space-y-5">

        {/* ════ TYPOGRAPHY TAB ════ */}
        {activeTab === "typography" && (
          <>
            {/* Font Size */}
            <div>
              <SectionHeader
                title="Font Size"
                hasValue={!!form.text_font_size}
                onReset={() => setForm(f => ({ ...f, text_font_size: null }))}
              />
              <div className="flex items-center gap-3 mb-2">
                <input type="range" min="10" max="48" step="1"
                  value={form.text_font_size || 14}
                  onChange={(e) => setForm(f => ({ ...f, text_font_size: parseInt(e.target.value) }))}
                  className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
                  <input type="number" min="8" max="72"
                    value={form.text_font_size || ""}
                    onChange={(e) => setForm(f => ({ ...f, text_font_size: e.target.value ? parseInt(e.target.value) : null }))}
                    placeholder="—"
                    className="w-8 bg-transparent text-xs text-cyan-400 font-mono outline-none text-center" />
                  <span className="text-[10px] text-slate-500">px</span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[11, 12, 14, 16, 18, 20, 24, 28, 32, 40].map((s) => (
                  <button key={s} type="button"
                    onClick={() => setForm(f => ({ ...f, text_font_size: f.text_font_size === s ? null : s }))}
                    className={`px-2 py-0.5 text-[10px] rounded border transition ${
                      form.text_font_size === s
                        ? "bg-cyan-600 border-cyan-500 text-white font-bold"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-cyan-600/40 hover:text-white"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Family */}
            <div>
              <SectionHeader
                title="Font Family"
                hasValue={!!form.text_font_family}
                onReset={() => setForm(f => ({ ...f, text_font_family: null }))}
              />
              <div className="grid grid-cols-2 gap-1.5">
                {FONTS.map((font) => (
                  <button key={font.value} type="button"
                    onClick={() => setForm(f => ({ ...f, text_font_family: font.value || null }))}
                    style={{ fontFamily: font.value || undefined }}
                    className={`px-3 py-2 text-xs rounded-lg border text-left transition ${
                      (form.text_font_family || "") === font.value
                        ? "bg-violet-600/30 border-violet-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}>
                    <span className="block text-[10px] text-slate-500 font-sans leading-none mb-0.5">{font.label}</span>
                    <span>Abc 123</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Weight */}
            <div>
              <SectionHeader
                title="Font Weight"
                hasValue={!!form.text_font_weight}
                onReset={() => setForm(f => ({ ...f, text_font_weight: null }))}
              />
              <div className="flex gap-1.5 flex-wrap">
                {FONT_WEIGHTS.map((w) => (
                  <button key={w.value} type="button"
                    onClick={() => setForm(f => ({ ...f, text_font_weight: f.text_font_weight === w.value ? null : w.value }))}
                    style={{ fontWeight: w.value }}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                      form.text_font_weight === w.value
                        ? "bg-violet-600 border-violet-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Alignment */}
            <div>
              <SectionHeader
                title="Text Alignment"
                hasValue={!!form.text_align}
                onReset={() => setForm(f => ({ ...f, text_align: null }))}
              />
              <div className="flex gap-2">
                {ALIGN_OPTIONS.map((a) => (
                  <button key={a.value} type="button" title={a.title}
                    onClick={() => setForm(f => ({ ...f, text_align: f.text_align === a.value ? null : a.value }))}
                    className={`flex-1 h-9 text-sm rounded-lg border transition ${
                      form.text_align === a.value
                        ? "bg-emerald-600 border-emerald-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white"
                    }`}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ════ SPACING TAB ════ */}
        {activeTab === "spacing" && (
          <>
            {/* Line Height */}
            <div>
              <SectionHeader
                title="Line Height"
                hasValue={!!form.text_line_height}
                onReset={() => setForm(f => ({ ...f, text_line_height: null }))}
              />
              <div className="flex items-center gap-3 mb-2">
                <input type="range" min="1" max="3" step="0.05"
                  value={form.text_line_height || 1.5}
                  onChange={(e) => setForm(f => ({ ...f, text_line_height: parseFloat(parseFloat(e.target.value).toFixed(2)) }))}
                  className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
                  <input type="number" min="0.8" max="4" step="0.1"
                    value={form.text_line_height || ""}
                    onChange={(e) => setForm(f => ({ ...f, text_line_height: e.target.value ? parseFloat(e.target.value) : null }))}
                    placeholder="—"
                    className="w-10 bg-transparent text-xs text-amber-400 font-mono outline-none text-center" />
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[1.0, 1.2, 1.4, 1.5, 1.6, 1.8, 2.0, 2.4].map((v) => (
                  <button key={v} type="button"
                    onClick={() => setForm(f => ({ ...f, text_line_height: f.text_line_height === v ? null : v }))}
                    className={`px-2 py-0.5 text-[10px] rounded border transition ${
                      form.text_line_height === v
                        ? "bg-amber-600 border-amber-500 text-white font-bold"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-amber-600/40 hover:text-white"
                    }`}>
                    {v}
                  </button>
                ))}
              </div>

              {/* Visual preview of line height */}
              {form.text_line_height && (
                <div className="mt-3 bg-slate-950/50 rounded-lg px-3 py-2 border border-slate-800">
                  <p style={{ lineHeight: form.text_line_height }} className="text-xs text-slate-300">
                    This is how your text will look with<br />
                    a line height of {form.text_line_height}.<br />
                    Notice the spacing between each line.
                  </p>
                </div>
              )}
            </div>

            {/* Letter Spacing */}
            <div>
              <SectionHeader
                title="Letter Spacing"
                hasValue={form.text_letter_spacing != null}
                onReset={() => setForm(f => ({ ...f, text_letter_spacing: null }))}
              />
              <div className="flex items-center gap-3 mb-2">
                <input type="range" min="-2" max="10" step="0.5"
                  value={form.text_letter_spacing ?? 0}
                  onChange={(e) => setForm(f => ({ ...f, text_letter_spacing: parseFloat(e.target.value) }))}
                  className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
                  <input type="number" min="-5" max="20" step="0.5"
                    value={form.text_letter_spacing ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, text_letter_spacing: e.target.value !== "" ? parseFloat(e.target.value) : null }))}
                    placeholder="—"
                    className="w-8 bg-transparent text-xs text-indigo-400 font-mono outline-none text-center" />
                  <span className="text-[10px] text-slate-500">px</span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[[-1, "Tight"], [0, "Normal"], [0.5, "Wide"], [1, "Wider"], [2, "Widest"], [4, "Spaced"]].map(([v, label]) => (
                  <button key={v} type="button"
                    onClick={() => setForm(f => ({ ...f, text_letter_spacing: f.text_letter_spacing === v ? null : v }))}
                    className={`px-2 py-0.5 text-[10px] rounded border transition ${
                      form.text_letter_spacing === v
                        ? "bg-indigo-600 border-indigo-500 text-white font-bold"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-indigo-600/40 hover:text-white"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ════ COLOR TAB ════ */}
        {activeTab === "color" && (
          <div>
            <SectionHeader
              title="Text Color"
              hasValue={!!form.text_color}
              onReset={() => { setForm(f => ({ ...f, text_color: null })); setHexInput(""); }}
            />

            {/* Swatches */}
            <div className="grid grid-cols-6 gap-2 mb-3">
              {COLOR_SWATCHES.map((c) => (
                <button key={c.value} type="button" title={c.label}
                  onClick={() => { setForm(f => ({ ...f, text_color: f.text_color === c.value ? null : c.value })); setHexInput(c.value); }}
                  className={`relative w-full aspect-square rounded-lg border-2 transition ${
                    form.text_color === c.value ? "border-white scale-110 shadow-lg" : "border-transparent hover:border-slate-500 hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.value }}>
                  {form.text_color === c.value && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px]"
                      style={{ color: c.value === "#ffffff" || c.value === "#f1f5f9" ? "#000" : "#fff" }}>✓</span>
                  )}
                </button>
              ))}
            </div>

            {/* Hex input */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg border border-slate-700 flex-shrink-0"
                style={{ backgroundColor: form.text_color || "transparent" }} />
              <div className="flex-1 flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-500">#</span>
                <input type="text" maxLength={7}
                  value={hexInput.replace("#", "")}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9a-fA-F]/g, "");
                    setHexInput("#" + raw);
                    if (raw.length === 6) setForm(f => ({ ...f, text_color: "#" + raw }));
                    if (raw.length === 0) setForm(f => ({ ...f, text_color: null }));
                  }}
                  placeholder="ffffff"
                  className="flex-1 bg-transparent text-xs text-white font-mono outline-none uppercase" />
              </div>
              <input type="color"
                value={form.text_color || "#ffffff"}
                onChange={(e) => { setForm(f => ({ ...f, text_color: e.target.value })); setHexInput(e.target.value); }}
                className="w-10 h-9 rounded-lg border border-slate-700 bg-slate-800 cursor-pointer p-0.5" />
            </div>

            {form.text_color && (
              <div className="mt-3 rounded-lg px-3 py-2.5 border border-slate-800 bg-slate-950/50">
                <p style={{ color: form.text_color }} className="text-sm font-medium">
                  This is how your question text will appear to students.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ════ LIMITS TAB ════ */}
        {activeTab === "limits" && (
          <div className="space-y-5">
            <div>
              <SectionHeader
                title="Max Characters"
                hasValue={!!form.max_length}
                onReset={() => setForm(f => ({ ...f, max_length: null }))}
              />
              <p className="text-[10px] text-slate-500 mb-2">
                Limits how many characters students can type in Writing or Short Answer questions.
              </p>
              <div className="flex items-center gap-3 mb-2">
                <input type="range" min="10" max="2000" step="10"
                  value={form.max_length || 500}
                  onChange={(e) => setForm(f => ({ ...f, max_length: parseInt(e.target.value) }))}
                  className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500" />
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
                  <input type="number" min="1" max="9999"
                    value={form.max_length || ""}
                    onChange={(e) => setForm(f => ({ ...f, max_length: e.target.value ? parseInt(e.target.value) : null }))}
                    placeholder="No limit"
                    className="w-16 bg-transparent text-xs text-pink-400 font-mono outline-none text-center" />
                  <span className="text-[10px] text-slate-500">chars</span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[[50,"Tweet"], [100,"Short"], [200,"Paragraph"], [500,"Essay"], [1000,"Long"], [2000,"Extended"]].map(([n, label]) => (
                  <button key={n} type="button"
                    onClick={() => setForm(f => ({ ...f, max_length: f.max_length === n ? null : n }))}
                    className={`px-2.5 py-1 text-[10px] rounded-lg border transition ${
                      form.max_length === n
                        ? "bg-pink-600 border-pink-500 text-white font-bold"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-pink-600/40 hover:text-white"
                    }`}>
                    <span className="text-slate-500 mr-1">{n}</span>{label}
                  </button>
                ))}
              </div>

              {/* Character budget visualiser */}
              {form.max_length && (
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>0</span>
                    <span className="text-pink-400 font-mono">{form.max_length} chars max</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full border border-slate-700 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-pink-500"
                      style={{ width: `${Math.min((form.max_length / 2000) * 100, 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── Live Preview ── */}
      <div className="px-4 pb-4">
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Live Preview</p>
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-700" />
              <span className="w-2 h-2 rounded-full bg-slate-700" />
              <span className="w-2 h-2 rounded-full bg-slate-700" />
            </div>
          </div>
          <div className="p-4">
            <p
              style={{
                fontSize:      form.text_font_size      ? `${form.text_font_size}px`      : "14px",
                fontFamily:    form.text_font_family    || undefined,
                fontWeight:    form.text_font_weight    || undefined,
                textAlign:     form.text_align          || undefined,
                lineHeight:    form.text_line_height    || 1.6,
                letterSpacing: form.text_letter_spacing != null ? `${form.text_letter_spacing}px` : undefined,
                color:         form.text_color          || "#e2e8f0",
              }}
              className="transition-all duration-150"
            >
              Which of the following best describes the water cycle?
            </p>
            {form.max_length && (
              <div className="mt-3 relative">
                <textarea
                  readOnly
                  placeholder="Student answer goes here..."
                  maxLength={form.max_length}
                  rows={2}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-500 placeholder-slate-600 resize-none outline-none"
                  style={{ fontFamily: form.text_font_family || undefined }}
                />
                <span className="absolute bottom-2 right-2 text-[9px] text-slate-600 font-mono">
                  0 / {form.max_length}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}