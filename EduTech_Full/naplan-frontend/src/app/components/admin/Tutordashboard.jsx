import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";


const API = import.meta.env.VITE_API_BASE_URL || "";

async function tutorFetch(url, options = {}) {
  const token = localStorage.getItem("tutor_token");
  return fetch(`${API}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

// ─── VerificationBadge ────────────────────────────────────────────────────────
function VerificationBadge({ status }) {
  if (status === "approved") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      Approved
    </span>
  );
  if (status === "rejected") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      Rejected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
      <span className="w-2 h-2 rounded-full bg-amber-400" />Pending
    </span>
  );
}

// ─── VerificationProgress ─────────────────────────────────────────────────────
function VerificationProgress({ verification }) {
  const { approved = 0, total = 0 } = verification || {};
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
        <span>{approved} / {total} verified</span><span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── AdminReviewBanner (read-only, shown to tutor) ────────────────────────────
function AdminReviewBanner({ question }) {
  const adminStatus  = question.admin_verification?.status  || "pending";
  const adminMessage = question.admin_verification?.message || null;
  if (adminStatus === "pending") return null;
  const isApproved = adminStatus === "approved";
  return (
    <div className={`mt-3 px-3 py-2.5 rounded-lg border flex items-start gap-2.5 ${
      isApproved ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"
    }`}>
      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
        isApproved ? "bg-emerald-500/20" : "bg-red-500/20"
      }`}>
        {isApproved ? (
          <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      <div className="min-w-0">
        <p className={`text-[10px] font-bold uppercase tracking-wider ${
          isApproved ? "text-emerald-400" : "text-red-400"
        }`}>
          Admin {isApproved ? "Approved" : "Rejected"}
        </p>
        {adminMessage && (
          <p className={`text-xs mt-0.5 ${isApproved ? "text-emerald-400/70" : "text-red-400/70"}`}>
            {adminMessage}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── VerifyControls ───────────────────────────────────────────────────────────
function VerifyControls({ question, onVerified }) {
  const [showReject, setShowReject] = useState(false);
  const [reason,     setReason]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const current = question.tutor_verification?.status || "pending";

  const handleVerify = async (status, rejection_reason = null) => {
    setLoading(true);
    try {
      const body = { status };
      if (rejection_reason) body.rejection_reason = rejection_reason;
      const res = await tutorFetch(`/api/tutor/questions/${question.question_id}/verify`, {
        method: "PATCH", body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Failed"); return; }
      onVerified((await res.json()).question);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); setShowReject(false); setReason(""); }
  };

  if (current === "approved") return (
    <div className="flex items-center gap-2 flex-wrap">
      <VerificationBadge status="approved" />
      <button disabled={loading} onClick={() => handleVerify("pending")}
        className="text-[10px] text-slate-500 hover:text-slate-300 underline disabled:opacity-40">Reset to Pending</button>
      {question.tutor_verification?.verified_by && (
        <span className="text-[10px] text-slate-600">by {question.tutor_verification.verified_by}</span>
      )}
    </div>
  );

  if (current === "rejected") return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <VerificationBadge status="rejected" />
        <button disabled={loading} onClick={() => handleVerify("pending")}
          className="text-[10px] text-slate-500 hover:text-slate-300 underline disabled:opacity-40">Reset to Pending</button>
        {question.tutor_verification?.verified_by && (
          <span className="text-[10px] text-slate-600">by {question.tutor_verification.verified_by}</span>
        )}
      </div>
      {question.tutor_verification?.rejection_reason && (
        <p className="text-[10px] text-red-400/80 italic">Reason: {question.tutor_verification.rejection_reason}</p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <VerificationBadge status="pending" />
        <button disabled={loading} onClick={() => { setShowReject(false); handleVerify("approved"); }}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg transition disabled:opacity-40">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          Approve
        </button>
        <button disabled={loading} onClick={() => setShowReject((v) => !v)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg transition disabled:opacity-40">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          Reject
        </button>
        {question.tutor_verification?.verified_by && (
          <span className="text-[10px] text-slate-600">by {question.tutor_verification.verified_by}</span>
        )}
      </div>
      {showReject && (
        <div className="flex items-center gap-2 mt-1">
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            className="flex-1 bg-slate-800 border border-red-600/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-red-500"
            onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) handleVerify("rejected", reason); }} />
          <button disabled={!reason.trim() || loading} onClick={() => handleVerify("rejected", reason)}
            className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-40">Confirm</button>
          <button onClick={() => { setShowReject(false); setReason(""); }}
            className="text-xs text-slate-500 hover:text-white">Cancel</button>
        </div>
      )}
    </div>
  );
}

// ─── EditQuestionModal ────────────────────────────────────────────────────────
function EditQuestionModal({ question, subTopicOptions, onSaved, onClose }) {
  const [text,        setText]       = useState(question.text || "");
  const [subTopic, setSubTopic] = useState(question.sub_topic || question.categories?.[0]?.name || "");
  const [options,     setOptions]    = useState((question.options || []).map((o) => ({ ...o })));
  const [explanation, setExplanation] = useState(question.explanation ? question.explanation : null);
  const [loading,     setLoading]    = useState(false);
  const [error,       setError]      = useState("");

  const isMultiCorrect = question.type === "checkbox";
  const hasOptions     = options.length > 0;

  const toggleCorrect = (idx) =>
    setOptions((prev) =>
      prev.map((o, i) =>
        isMultiCorrect
          ? i === idx ? { ...o, correct: !o.correct } : o
          : { ...o, correct: i === idx }
      )
    );

  const updateOptionText = (idx, val) =>
    setOptions((prev) => prev.map((o, i) => i === idx ? { ...o, text: val } : o));

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!text.trim()) { setError("Question text cannot be empty."); return; }
    if (hasOptions && !options.some((o) => o.correct)) {
      setError("Please mark at least one option as correct."); return;
    }
    setLoading(true);
    try {
      const res = await tutorFetch(`/api/tutor/questions/${question.question_id}/edit`, {
        method: "PATCH",
        body: JSON.stringify({
          text:        text.trim(),
          explanation: explanation !== null ? explanation.trim() : "",
          sub_topic:   subTopic.trim() || null,
          options:     options.map((o) => ({
            option_id: o.option_id,
            text:      (o.text || "").trim(),
            image_url: o.image_url ?? null,
            correct:   Boolean(o.correct),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      onSaved({ ...data.question, sub_topic: subTopic.trim() || null });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sectionNum = (n) => (
    <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
      n === 1 ? "bg-indigo-600/30 border border-indigo-500/40 text-indigo-400"
      : n === 2 ? "bg-emerald-600/30 border border-emerald-500/40 text-emerald-400"
      : n === 3 ? "bg-cyan-600/30 border border-cyan-500/40 text-cyan-400"
      : "bg-amber-600/30 border border-amber-500/40 text-amber-400"
    }`}>{n}</span>
  );

  const subTopicNum    = hasOptions ? 3 : 2;
  const explanationNum = hasOptions ? 4 : 3;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl my-8 shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-white">Edit Question</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Saving resets verification to <span className="text-amber-400 font-medium">Pending</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none mt-0.5">✕</button>
        </div>

        <form onSubmit={handleSave}>
          <div className="px-6 py-5 space-y-7">
            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</p>
            )}

            <section className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {sectionNum(1)} Question Text <span className="text-red-400 font-normal normal-case tracking-normal">*</span>
              </label>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
                placeholder="Enter the question text…"
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-4 py-3 resize-y placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition leading-relaxed" />
            </section>

            {hasOptions && (
              <section className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  {sectionNum(2)} Answer Options
                  <span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal ml-1">
                    — {isMultiCorrect ? "check all correct" : "click circle to set correct answer"}
                  </span>
                </label>
                <div className="space-y-2">
                  {options.map((opt, idx) => {
                    const label = String.fromCharCode(65 + idx);
                    return (
                      <div key={opt.option_id || idx}
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                          opt.correct ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-800/60 border-slate-700/50 hover:border-slate-600"
                        }`}>
                        <button type="button" onClick={() => toggleCorrect(idx)}
                          className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            opt.correct ? "bg-emerald-500 border-emerald-500 text-white" : "bg-transparent border-slate-600 hover:border-emerald-500"
                          }`}>
                          {opt.correct && (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <span className={`flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold mt-0.5 ${
                          opt.correct ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-400"
                        }`}>{label}</span>
                        {opt.image_url && (
                          <img src={opt.image_url} alt={`Option ${label}`} className="h-12 rounded-lg object-contain border border-slate-600 flex-shrink-0" />
                        )}
                        <input type="text" value={opt.text || ""} onChange={(e) => updateOptionText(idx, e.target.value)}
                          placeholder={`Option ${label}…`}
                          className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none" />
                        {opt.correct && (
                          <span className="flex-shrink-0 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md mt-0.5 whitespace-nowrap">✓ Correct</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {sectionNum(subTopicNum)} Sub-topic
                <span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal ml-1">— from admin settings</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-cyan-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </span>
                <input type="text" value={subTopic} onChange={(e) => setSubTopic(e.target.value)}
                placeholder="Type sub-topic…" maxLength={80}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl pl-10 pr-4 py-2.5 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition" />
              </div>
              {subTopic && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-slate-500">Preview:</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/15 border border-cyan-500/30 rounded-lg text-cyan-300 text-[11px] font-semibold">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                    {subTopic}
                  </span>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {sectionNum(explanationNum)} Explanation
                <span className="text-[10px] text-slate-500 font-normal normal-case tracking-normal ml-1">— optional</span>
              </label>
              {explanation !== null ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-amber-500/15">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                      <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">Explanation present</span>
                    </div>
                    <button type="button" onClick={() => setExplanation(null)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Remove
                    </button>
                  </div>
                  <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3}
                    placeholder="Enter the explanation…"
                    className="w-full bg-transparent text-sm text-amber-300/90 placeholder:text-slate-500 px-4 py-3 resize-y focus:outline-none leading-relaxed" />
                </div>
              ) : (
                <button type="button" onClick={() => setExplanation("")}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-600 hover:border-amber-500/40 text-slate-500 hover:text-amber-400 text-sm transition group">
                  <svg className="w-4 h-4 group-hover:text-amber-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Add explanation
                </button>
              )}
            </section>
          </div>

          <div className="px-6 pb-6 pt-4 border-t border-slate-800 flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-xl transition">
              Cancel
            </button>
            <button type="submit" disabled={loading || !text.trim()}
              className="flex-1 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving…
                </span>
              ) : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
// ─── Difficulty Badge ─────────────────────────────────────────────────────────
function DifficultyBadge({ difficulty }) {
  if (difficulty === undefined || difficulty === null || difficulty === "") return null;

  // Numeric scale (0-5) → label
  const numMap = { 0: "Standard", 1: "Easy", 2: "Easy", 3: "Medium", 4: "Hard", 5: "Hard" };
  const label = typeof difficulty === "number" ? numMap[difficulty] : String(difficulty);

  const styles = {
    Easy:     "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    easy:     "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Medium:   "bg-amber-500/15  text-amber-300  border-amber-500/30",
    medium:   "bg-amber-500/15  text-amber-300  border-amber-500/30",
    Standard: "bg-amber-500/15  text-amber-300  border-amber-500/30",
    Hard:     "bg-rose-500/15   text-rose-300   border-rose-500/30",
    hard:     "bg-rose-500/15   text-rose-300   border-rose-500/30",
  };
  const dots = {
    Easy: "bg-emerald-400", easy: "bg-emerald-400",
    Medium: "bg-amber-400", medium: "bg-amber-400", Standard: "bg-amber-400",
    Hard: "bg-rose-400",   hard: "bg-rose-400",
  };

  const cls = styles[label] || "bg-slate-500/15 text-slate-300 border-slate-500/30";
  const dot = dots[label]   || "bg-slate-400";

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  );
}
// ─── QuizFlagPanel ────────────────────────────────────────────────────────────
function QuizFlagPanel({ quiz, onFlagged }) {
  const [open,    setOpen]    = useState(false);
  const [comment, setComment] = useState(quiz.tutor_flag?.comment || "");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const isFlagged = quiz.tutor_flag?.status === "flagged";

  const handleSubmit = async (status) => {
    if (status === "flagged" && !comment.trim()) {
      setError("Please enter a comment."); return;
    }
    setLoading(true); setError("");
    try {
      const res = await tutorFetch(`/api/tutor/quizzes/${quiz.quiz_id}/flag`, {
        method: "PATCH",
        body: JSON.stringify({ status, comment: comment.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onFlagged(data.quiz);
      setOpen(false);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const QUICK = [
    "Quiz name appears incorrect",
    "Difficulty level seems wrong",
    "Time limit is too short / too long",
    "Wrong subject or year level",
    "Other issue",
  ];

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition ${
          isFlagged
            ? "bg-orange-500/15 border-orange-500/40 text-orange-300 hover:bg-orange-500/25"
            : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
        }`}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
        </svg>
        {isFlagged ? "Flagged" : "Flag Issue"}
      </button>

      {open && (
        <div className="mt-3 bg-slate-800/60 border border-orange-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-orange-300">Report a quiz-level issue</p>
            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white text-sm">✕</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => setComment(q)}
                className={`px-2.5 py-1 rounded-lg border text-[10px] font-medium transition ${
                  comment === q
                    ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
                    : "bg-slate-700/50 border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"
                }`}>{q}</button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => { setComment(e.target.value); setError(""); }}
            rows={3} placeholder="Describe the issue in detail…"
            className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 resize-none placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition" />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <div className="flex items-center gap-2">
            <button disabled={loading || !comment.trim()} onClick={() => handleSubmit("flagged")}
              className="px-4 py-1.5 text-xs font-semibold bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white rounded-lg transition">
              {loading ? "Saving…" : "Submit Flag"}
            </button>
            {isFlagged && (
              <button disabled={loading} onClick={() => handleSubmit("cleared")}
                className="px-4 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition disabled:opacity-40">
                Clear Flag
              </button>
            )}
            <button onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-white ml-auto">Cancel</button>
          </div>
          {isFlagged && quiz.tutor_flag?.flagged_by && (
            <p className="text-[10px] text-slate-500 border-t border-slate-700 pt-2">
              Flagged by <span className="text-orange-400">{quiz.tutor_flag.flagged_by}</span>
              {quiz.tutor_flag.flagged_at && ` · ${new Date(quiz.tutor_flag.flagged_at).toLocaleDateString()}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
// ─── Main TutorDashboard ──────────────────────────────────────────────────────
export default function TutorDashboard() {
  const navigate = useNavigate();
  const [tutorInfo,      setTutorInfo]      = useState(null);
  const [quizzes,        setQuizzes]        = useState([]);
  const [selectedQuiz,   setSelectedQuiz]   = useState(null);
  const [questions,      setQuestions]      = useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [loadingQs,      setLoadingQs]      = useState(false);
  const [filter,         setFilter]         = useState("all");
  const [zoomedImage,    setZoomedImage]    = useState(null);
  const [editQuestion,   setEditQuestion]   = useState(null);
  const [quizSearch,     setQuizSearch]     = useState("");
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [subTopicOptions, setSubTopicOptions] = useState([]);

  const tutorData = (() => {
    try { return JSON.parse(localStorage.getItem("tutor_info") || "{}"); } catch { return {}; }
  })();

  const fetchQuizzes = useCallback(async () => {
    try {
      setLoadingQuizzes(true);
      const res = await tutorFetch("/api/tutor/quizzes");
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("tutor_token");
        localStorage.removeItem("tutor_info");
        navigate(`${ADMIN_PATH}/tutor`);
        return;
      }
      const data = await res.json();
      setQuizzes(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
    finally { setLoadingQuizzes(false); }
  }, [navigate]);

  const fetchQuizDetail = async (quizId) => {
    localStorage.setItem("tutor_selected_quiz_id", quizId);
    try {
      setLoadingQs(true);
      const res = await tutorFetch(`/api/tutor/quizzes/${quizId}`);
      if (!res.ok) throw new Error("Failed to load quiz");
      const data = await res.json();
      setSelectedQuiz(data);
      setQuestions(data.questions || []);
      setFilter("all");
      const fromQuiz = data.sub_topic ? [data.sub_topic] : [];

      // Pull from sub_topic OR categories[0].name — whichever admin set
      const fromQs = (data.questions || []).flatMap(q => {
        const vals = [];
        if (q.sub_topic) vals.push(q.sub_topic);
        if (q.categories?.length > 0) {
          q.categories.forEach(c => { if (c.name) vals.push(c.name); });
        }
        return vals;
      });

      const unique = [...new Set([...fromQuiz, ...fromQs])].sort();
      setSubTopicOptions(unique);
    } catch (err) { alert(err.message); }
    finally { setLoadingQs(false); }
  };

   useEffect(() => {
  fetchQuizzes().then(() => {
    const lastQuizId = localStorage.getItem("tutor_selected_quiz_id");
    if (lastQuizId) fetchQuizDetail(lastQuizId);
  });

  tutorFetch("/api/tutor/me")
    .then((r) => r.json())
    .then((d) => { if (d.tutor) setTutorInfo(d.tutor); })
    .catch(() => {});
}, [fetchQuizzes]);

  const syncQuizStats = (allQs, quizId) => {
    setQuizzes((prev) => prev.map((qz) => {
      if (qz.quiz_id !== quizId) return qz;
      const approved = allQs.filter((q) => (q.tutor_verification?.status || "pending") === "approved").length;
      const rejected = allQs.filter((q) => (q.tutor_verification?.status || "pending") === "rejected").length;
      const pending  = allQs.filter((q) => (q.tutor_verification?.status || "pending") === "pending").length;
      return { ...qz, verification: { total: allQs.length, approved, rejected, pending } };
    }));
  };

  const handleQuestionVerified = (updatedQ) => {
    const allQs = questions.map((q) => q.question_id === updatedQ.question_id ? updatedQ : q);
    setQuestions(allQs);
    syncQuizStats(allQs, selectedQuiz?.quiz_id);
  };

  const handleQuestionEdited = (updatedQ) => {
  const allQs = questions.map((q) =>
    q.question_id === updatedQ.question_id
      ? { ...q, ...updatedQ, sub_topic: updatedQ.sub_topic }
      : q
  );
  setQuestions(allQs);
  syncQuizStats(allQs, selectedQuiz?.quiz_id);
  setEditQuestion(null);
};

  const handleQuizFlagged = (updatedQuiz) => {
  setSelectedQuiz((prev) => ({ ...prev, tutor_flag: updatedQuiz.tutor_flag }));
  setQuizzes((prev) => prev.map((qz) =>
    qz.quiz_id === updatedQuiz.quiz_id ? { ...qz, tutor_flag: updatedQuiz.tutor_flag } : qz
  ));
};

  const handleLogout = async () => {
    try { await tutorFetch("/api/admin/logout", { method: "POST" }); } catch {}
    localStorage.removeItem("tutor_token");
    localStorage.removeItem("tutor_info");
    navigate(`${ADMIN_PATH}/tutor`);
  };

  const filteredQuestions = questions.filter((q) => {
    const s = q.tutor_verification?.status || "pending";
    return filter === "all" ? true : s === filter;
  });

  const verStats = questions.reduce(
    (acc, q) => { const s = q.tutor_verification?.status || "pending"; acc[s] = (acc[s] || 0) + 1; return acc; },
    { approved: 0, rejected: 0, pending: 0 }
  );

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col overflow-hidden">

      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <span className="text-base font-semibold text-white">Tutor Portal</span>
              <p className="text-[11px] text-slate-500">Question Verification</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{tutorData.name || tutorData.email || ""}</span>
            <button onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden max-w-7xl mx-auto w-full">

        {/* Sidebar */}
        <aside className="w-72 flex-shrink-0 border-r border-slate-800 overflow-y-auto py-4 px-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest px-2 mb-3">Assigned Quizzes</p>
          <input
            type="text"
            value={quizSearch}
            onChange={(e) => setQuizSearch(e.target.value)}
            placeholder="Search quizzes…"
            className="w-full bg-slate-900 border border-slate-800 text-white text-sm rounded-lg px-3 py-2 mb-3 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
         <div className="flex items-stretch gap-1 mb-3 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {[
              { id: "all",        label: "All"         },
              { id: "inprogress", label: "In Progress" },
              { id: "completed",  label: "Completed"   },
            ].map((t) => {
              const count = quizzes.filter((qz) => {
                const v = qz.verification || {};
                const total   = v.total   || 0;
                const pending = v.pending ?? total;
                if (t.id === "completed")  return total > 0 && pending === 0;
                if (t.id === "inprogress") return total === 0 || pending > 0;
                return true;
              }).length;
              const active = statusFilter === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setStatusFilter(t.id)}
                  className={`flex-1 flex flex-col items-center justify-center px-1 py-1.5 rounded-md transition ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}>
                  <span className="text-[10px] font-medium leading-tight whitespace-nowrap">
                    {t.label}
                  </span>
                  <span className={`text-sm font-bold leading-tight mt-0.5 ${
                    active ? "text-white" : "text-slate-300"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          {loadingQuizzes ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : quizzes.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">No quizzes assigned yet.</p>
          ) : (
            quizzes
              .filter((qz) => {
                const v = qz.verification || {};
                const total   = v.total   || 0;
                const pending = v.pending ?? total;
                if (statusFilter === "completed")  return total > 0 && pending === 0;
                if (statusFilter === "inprogress") return total === 0 || pending > 0;
                return true;
              })
              .filter((qz) => {
                const s = quizSearch.toLowerCase().trim();
                if (!s) return true;
                return (
                  (qz.quiz_name || "").toLowerCase().includes(s) ||
                  (qz.subject   || "").toLowerCase().includes(s) ||
                  String(qz.year_level || "").includes(s)
                );
              })
              .map((qz) => {
              const isSelected = selectedQuiz?.quiz_id === qz.quiz_id;
              return (
               <button key={qz.quiz_id} onClick={() => fetchQuizDetail(qz.quiz_id)}
                  className={`w-full text-left rounded-xl px-3 py-3 mb-1.5 transition border ${
                    isSelected ? "bg-indigo-600/20 border-indigo-500/40 text-white" : "bg-transparent border-transparent hover:bg-slate-800/60 text-slate-300"
                  }`}>
                  <p className="text-sm font-medium leading-tight line-clamp-2">{qz.quiz_name}</p>
                  {qz.year_level && (
                    <p className="text-[10px] text-slate-500 mt-0.5">Year {qz.year_level}{qz.subject ? ` · ${qz.subject}` : ""}</p>
                  )}

                  {/* ── Difficulty + Duration badges ── */}
                  {(qz.difficulty != null || qz.time_limit_minutes) && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {qz.difficulty != null && qz.difficulty !== "" && (
                        <DifficultyBadge difficulty={qz.difficulty} />
                      )}
                      {qz.time_limit_minutes && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold bg-slate-700/50 text-slate-300 border-slate-600/50">
                          <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                          </svg>
                          {qz.time_limit_minutes} min
                        </span>
                      )}
                    </div>
                  )}
                  <VerificationProgress verification={qz.verification} />
                </button>
              );
            })
          )}
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {!selectedQuiz ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
              <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">Select a quiz to review questions</p>
            </div>
          ) : loadingQs ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Quiz header */}
              <div className="mb-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{selectedQuiz.quiz_name}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {questions.length} question{questions.length !== 1 ? "s" : ""}
                      {selectedQuiz.year_level ? ` · Year ${selectedQuiz.year_level}` : ""}
                      {selectedQuiz.subject ? ` · ${selectedQuiz.subject}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-400 font-semibold">{verStats.approved}✓</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-red-400 font-semibold">{verStats.rejected}✗</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-amber-400 font-semibold">{verStats.pending}⋯</span>
                    <span className="text-slate-500">/ {questions.length}</span>
                    <QuizFlagPanel quiz={selectedQuiz} onFlagged={handleQuizFlagged} />
                  </div>
                </div>
                {selectedQuiz.tutor_flag?.status === "flagged" && (
                  <div className="mt-3 flex items-start gap-2.5 px-3 py-2.5 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                    <svg className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                    </svg>
                    <div>
                      <p className="text-[11px] font-semibold text-orange-300">Quiz Flagged</p>
                      <p className="text-xs text-orange-400/80 mt-0.5">{selectedQuiz.tutor_flag.comment}</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-1 mt-3">
                  {[
                    { key: "all",      label: `All (${questions.length})` },
                    { key: "pending",  label: `Pending (${verStats.pending})` },
                    { key: "approved", label: `Approved (${verStats.approved})` },
                    { key: "rejected", label: `Rejected (${verStats.rejected})` },
                  ].map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                      className={`px-3 py-1 text-xs rounded-lg transition ${filter === f.key ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question cards */}
              <div className="space-y-3 pb-6">
                {filteredQuestions.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-sm">No questions match this filter</div>
                ) : (
                  filteredQuestions.map((q, idx) => {
                    const status = q.tutor_verification?.status || "pending";
                    return (
                      <div key={q.question_id}
                        className={`bg-slate-900 border rounded-xl p-5 transition ${
                          status === "approved" ? "border-emerald-800/40" :
                          status === "rejected" ? "border-red-800/40" :
                          "border-slate-800"
                        }`}>

                        {/* Card header */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="text-[11px] font-bold text-slate-500 flex-shrink-0">Q{idx + 1}</span>
                            {q.subject && (
                              <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md">{q.subject}</span>
                            )}
                            {(q.sub_category || q.subcategory) && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-500/15 border border-violet-500/30 rounded-lg">
                                <span className="text-xs font-semibold text-violet-300">{q.sub_category || q.subcategory}</span>
                              </div>
                            )}
                  {(q.sub_topic || q.categories?.[0]?.name) && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/15 border border-cyan-500/30 rounded-lg">
                        <svg className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        <span className="text-xs font-semibold text-cyan-300">
                          {q.sub_topic || q.categories?.[0]?.name}
                        </span>
                      </div>
                    )}

                             {(q.difficulty !== undefined && q.difficulty !== null) && (
                            <DifficultyBadge difficulty={q.difficulty} />
                            )}
                          </div>
                          <button onClick={() => setEditQuestion(q)}
                            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 rounded-lg transition">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.25 2.25 0 013.182 3.182L6.75 19.963l-4.5 1.125 1.125-4.5L16.862 3.487z" />
                            </svg>
                            Edit
                          </button>
                        </div>

                        {/* Question text */}
                      <div
                        className="text-sm text-white leading-relaxed mb-3 prose prose-invert prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: q.text }}
                      />
                        {/* Question image */}
                        {q.image_url && (
                          <div className="mb-3">
                            <img src={q.image_url} alt="Question" onClick={() => setZoomedImage(q.image_url)}
                              className="max-h-48 rounded-lg border border-slate-700 cursor-zoom-in object-contain" />
                          </div>
                        )}

                        {/* Options */}
                        {q.options && q.options.length > 0 && (
                          <div className="space-y-1.5 mb-3">
                            {q.options.map((opt, oi) => (
                              <div key={opt.option_id || oi}
                                className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm border ${
                                  opt.correct ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-slate-800/50 border-slate-700/50 text-slate-400"
                                }`}>
                                <span className="text-[10px] font-bold mt-0.5 flex-shrink-0">{String.fromCharCode(65 + oi)}</span>
                                {opt.image_url && (
                                  <img src={opt.image_url} alt="" className="h-10 rounded cursor-zoom-in object-contain"
                                    onClick={() => setZoomedImage(opt.image_url)} />
                                )}
                                {opt.text && <span className="leading-relaxed">{opt.text}</span>}
                                {opt.correct && (
                                  <svg className="w-3.5 h-3.5 text-emerald-400 ml-auto flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Explanation */}
                        {q.explanation && (
                          <div className="mb-3 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                            <p className="text-[10px] text-amber-500 font-bold mb-0.5">Explanation</p>
                            <div
                              className="text-xs text-amber-400/80 prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: q.explanation }}
                              />
                          </div>
                        )}

                        {/* ── Tutor verify controls ── */}
                        <div className="pt-3 border-t border-slate-800">
                          <VerifyControls question={q} onVerified={handleQuestionVerified} />
                        </div>

                        {/* ── Admin decision (read-only, visible to tutor) ── */}
                        <AdminReviewBanner question={q} />

                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Image zoom overlay */}
      {zoomedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setZoomedImage(null)}>
          <img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}

      {/* Edit modal */}
      {editQuestion && (
        <EditQuestionModal
          question={editQuestion}
          subTopicOptions={subTopicOptions}
          onSaved={handleQuestionEdited}
          onClose={() => setEditQuestion(null)}
        />
      )}
    </div>
  );
}
