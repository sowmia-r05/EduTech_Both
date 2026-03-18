/**
 * TutorDashboard.jsx
 *
 * Tutor's workspace:
 *   - Left: list of assigned quizzes with verification progress bar
 *   - Right: selected quiz with all questions + approve/reject/edit controls
 *
 * ✅ FIXED: Now reads from "tutor_token" / "tutor_info" — separate from admin session.
 * ✅ NEW: Tutor can edit question text, options, and explanation.
 *         Editing resets verification status back to "pending" automatically.
 * ✅ NEW: Approved questions only show the green badge + Edit button (no Approve/Reject clutter).
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

const API = import.meta.env.VITE_API_BASE_URL || "";

// ✅ FIXED: Read from tutor_token
function tutorFetch(url, opts = {}) {
  const token = localStorage.getItem("tutor_token");
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(opts.headers || {}),
  };
  if (!headers["Content-Type"] && typeof opts.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${API}${url}`, { ...opts, headers });
}

// ─── Verification Badge ───────────────────────────────────────────────────────
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
      <span className="w-2 h-2 rounded-full bg-amber-400" />
      Pending
    </span>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ approved, total }) {
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
        <span>{approved} / {total} verified</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-indigo-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Edit Question Modal ──────────────────────────────────────────────────────
function EditQuestionModal({ question, onSaved, onClose }) {
  const [text,        setText]        = useState(question.text || "");
  const [explanation, setExplanation] = useState(question.explanation || "");
  const [options,     setOptions]     = useState(
    (question.options || []).map((o) => ({ ...o }))
  );
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const updateOptionText = (idx, val) => {
    setOptions((prev) => prev.map((o, i) => i === idx ? { ...o, text: val } : o));
  };

  const toggleCorrect = (idx) => {
    setOptions((prev) => prev.map((o, i) => ({ ...o, correct: i === idx })));
  };

  const handleSave = async () => {
    if (!text.trim()) { setError("Question text is required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await tutorFetch(`/api/tutor/questions/${question.question_id}/edit`, {
        method: "PATCH",
        body: JSON.stringify({
          text:        text.trim(),
          explanation: explanation.trim(),
          options:     options.map((o) => ({
            option_id: o.option_id,
            text:      o.text,
            correct:   o.correct,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data.question);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl p-6 space-y-4 my-8">

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Edit Question</h2>
            <p className="text-[11px] text-amber-400 mt-0.5">⚠ Saving will reset verification status to Pending</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Question text */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Question Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Options */}
        {options.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Options <span className="text-slate-600 font-normal">(click radio to mark correct)</span>
            </label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={opt.option_id || idx} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCorrect(idx)}
                    className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition ${
                      opt.correct
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-slate-600 bg-transparent hover:border-slate-400"
                    }`}
                  />
                  <span className="text-xs text-slate-500 w-4 flex-shrink-0">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <input
                    type="text"
                    value={opt.text || ""}
                    onChange={(e) => updateOptionText(idx, e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Explanation */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Explanation</label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={2}
            placeholder="Explain the correct answer…"
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition"
          >
            {loading ? "Saving…" : "Save Changes"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Verify Controls ─────────────────────────────────────────────────────────
// ✅ NEW behaviour:
//   - approved  → only show green badge + Edit button
//   - rejected  → show badge, rejection reason, Edit button, Reset
//   - pending   → show Approve + Reject buttons + Edit button
function VerifyControls({ question, onVerified, onEdit }) {
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
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Failed"); return; }
      const data = await res.json();
      onVerified(data.question);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); setShowReject(false); setReason(""); }
  };

  // ✅ APPROVED: only badge + edit
  if (current === "approved") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <VerificationBadge status="approved" />
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-700/60 hover:bg-slate-700 text-slate-300 border border-slate-600/50 rounded-lg transition"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
          Edit
        </button>
      </div>
    );
  }

  // ✅ REJECTED: badge + reason + edit + reset
  if (current === "rejected") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <VerificationBadge status="rejected" />
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-700/60 hover:bg-slate-700 text-slate-300 border border-slate-600/50 rounded-lg transition"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
            Edit
          </button>
          <button
            disabled={loading}
            onClick={() => handleVerify("pending")}
            className="text-[10px] text-slate-500 hover:text-slate-300 underline disabled:opacity-40"
          >
            Reset to Pending
          </button>
          {question.tutor_verification?.verified_by && (
            <span className="text-[10px] text-slate-600">by {question.tutor_verification.verified_by}</span>
          )}
        </div>
        {question.tutor_verification?.rejection_reason && (
          <p className="text-[10px] text-red-400/80 italic">
            Reason: {question.tutor_verification.rejection_reason}
          </p>
        )}
      </div>
    );
  }

  // ✅ PENDING: approve + reject + edit
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <VerificationBadge status="pending" />

        <button
          disabled={loading}
          onClick={() => { setShowReject(false); handleVerify("approved"); }}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg transition disabled:opacity-40"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Approve
        </button>

        <button
          disabled={loading}
          onClick={() => setShowReject((v) => !v)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg transition disabled:opacity-40"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Reject
        </button>

        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-700/60 hover:bg-slate-700 text-slate-300 border border-slate-600/50 rounded-lg transition"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
          Edit
        </button>

        {question.tutor_verification?.verified_by && (
          <span className="text-[10px] text-slate-600">by {question.tutor_verification.verified_by}</span>
        )}
      </div>

      {showReject && (
        <div className="flex items-center gap-2 mt-1">
          <input
            type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            className="flex-1 bg-slate-800 border border-red-600/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-red-500"
            onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) handleVerify("rejected", reason); }}
          />
          <button
            disabled={!reason.trim() || loading}
            onClick={() => handleVerify("rejected", reason)}
            className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-40"
          >
            Confirm
          </button>
          <button
            onClick={() => { setShowReject(false); setReason(""); }}
            className="text-xs text-slate-500 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main TutorDashboard ──────────────────────────────────────────────────────
export default function TutorDashboard() {
  const navigate = useNavigate();
  const [tutorInfo,       setTutorInfo]       = useState(null);
  const [quizzes,         setQuizzes]         = useState([]);
  const [selectedQuiz,    setSelectedQuiz]    = useState(null);
  const [questions,       setQuestions]       = useState([]);
  const [loadingQuizzes,  setLoadingQuizzes]  = useState(true);
  const [loadingQs,       setLoadingQs]       = useState(false);
  const [filter,          setFilter]          = useState("all");
  const [editingQuestion, setEditingQuestion] = useState(null); // question being edited

  // ✅ FIXED: Read from tutor_info
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
    try {
      setLoadingQs(true);
      const res = await tutorFetch(`/api/tutor/quizzes/${quizId}`);
      if (!res.ok) throw new Error("Failed to load quiz");
      const data = await res.json();
      setSelectedQuiz(data);
      setQuestions(data.questions || []);
    } catch (err) { alert(err.message); }
    finally { setLoadingQs(false); }
  };

  useEffect(() => {
    fetchQuizzes();
    tutorFetch("/api/tutor/me")
      .then((r) => r.json())
      .then((d) => { if (d.tutor) setTutorInfo(d.tutor); })
      .catch(() => {});
  }, [fetchQuizzes]);

  const handleQuestionVerified = (updatedQ) => {
    setQuestions((prev) => prev.map((q) => q.question_id === updatedQ.question_id ? updatedQ : q));
    setQuizzes((prev) => prev.map((qz) => {
      if (qz.quiz_id !== selectedQuiz?.quiz_id) return qz;
      const allQs = questions.map((q) => q.question_id === updatedQ.question_id ? updatedQ : q);
      const approved = allQs.filter((q) => (q.tutor_verification?.status || "pending") === "approved").length;
      const rejected = allQs.filter((q) => (q.tutor_verification?.status || "pending") === "rejected").length;
      const pending  = allQs.filter((q) => (q.tutor_verification?.status || "pending") === "pending").length;
      return { ...qz, verification: { total: allQs.length, approved, rejected, pending } };
    }));
  };

  // ✅ Called when tutor saves an edit — updates question in state
  const handleQuestionEdited = (updatedQ) => {
    setEditingQuestion(null);
    handleQuestionVerified(updatedQ); // reuse — status is now "pending" so stats update too
  };

  const handleLogout = async () => {
    try { await tutorFetch("/api/admin/logout", { method: "POST" }); } catch {}
    // ✅ FIXED: Clear tutor-specific keys
    localStorage.removeItem("tutor_token");
    localStorage.removeItem("tutor_info");
    navigate(`${ADMIN_PATH}/tutor`);
  };

  const filteredQuestions = questions.filter((q) => {
    const s = q.tutor_verification?.status || "pending";
    if (filter === "all") return true;
    return s === filter;
  });

  const verStats = questions.reduce(
    (acc, q) => { const s = q.tutor_verification?.status || "pending"; acc[s] = (acc[s] || 0) + 1; return acc; },
    { approved: 0, rejected: 0, pending: 0 }
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">

      {/* ── Header ── */}
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
            <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-white transition">Logout</button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 max-w-7xl mx-auto w-full px-6 py-6 gap-6">

        {/* ── Left: Quiz List ── */}
        <aside className="w-72 flex-shrink-0">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">
            Assigned Quizzes
            <span className="ml-2 text-[11px] text-slate-500 font-normal">({quizzes.length})</span>
          </h2>

          {loadingQuizzes ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : quizzes.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-slate-500 text-sm">No quizzes assigned yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {quizzes.map((qz) => {
                const v = qz.verification || {};
                const isSelected = selectedQuiz?.quiz_id === qz.quiz_id;
                return (
                  <button
                    key={qz.quiz_id}
                    onClick={() => fetchQuizDetail(qz.quiz_id)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      isSelected
                        ? "bg-indigo-600/20 border-indigo-500/40 text-white"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <p className="text-xs font-medium leading-snug">{qz.quiz_name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Year {qz.year_level} · {qz.subject}
                    </p>
                    <ProgressBar approved={v.approved || 0} total={v.total || 0} />
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* ── Right: Question List ── */}
        <main className="flex-1 min-w-0">
          {!selectedQuiz && !loadingQs && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-3">👈</div>
                <p className="text-slate-400 font-medium">Select a quiz to start verifying</p>
                <p className="text-slate-600 text-sm mt-1">Choose from your assigned quizzes on the left</p>
              </div>
            </div>
          )}

          {loadingQs && (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {selectedQuiz && !loadingQs && (
            <>
              {/* Quiz header */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-4 mb-4">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{selectedQuiz.quiz_name}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Year {selectedQuiz.year_level} · {selectedQuiz.subject} · {questions.length} questions
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs">
                    <span className="text-emerald-400 font-semibold">{verStats.approved}✓</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-red-400 font-semibold">{verStats.rejected}✗</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-amber-400 font-semibold">{verStats.pending}⋯</span>
                    <span className="text-slate-500">/ {questions.length}</span>
                  </div>
                </div>

                {/* Filter tabs */}
                <div className="flex gap-1 mt-3">
                  {[
                    { key: "all",      label: `All (${questions.length})` },
                    { key: "pending",  label: `Pending (${verStats.pending})` },
                    { key: "approved", label: `Approved (${verStats.approved})` },
                    { key: "rejected", label: `Rejected (${verStats.rejected})` },
                  ].map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                      className={`px-3 py-1 text-xs rounded-lg transition ${
                        filter === f.key
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-white hover:bg-slate-800"
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Questions */}
              <div className="space-y-3">
                {filteredQuestions.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-sm">No questions match this filter</div>
                ) : (
                  filteredQuestions.map((q, idx) => {
                    const status = q.tutor_verification?.status || "pending";
                    return (
                      <div
                        key={q.question_id}
                        className={`bg-slate-900 border rounded-xl p-4 transition ${
                          status === "approved" ? "border-emerald-800/40" :
                          status === "rejected" ? "border-red-800/40" :
                          "border-slate-800"
                        }`}
                      >
                        {/* Question header */}
                        <div className="flex items-start gap-3 mb-3">
                          <span className="text-xs font-bold text-slate-600 bg-slate-800 rounded-md px-2 py-1 flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white leading-relaxed">{q.text}</p>
                            {q.image_url && (
                              <img src={q.image_url} alt="" className="mt-2 max-h-40 rounded-lg object-contain" />
                            )}
                          </div>
                        </div>

                        {/* Options */}
                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-2 gap-1.5 mb-3 pl-9">
                            {q.options.map((opt, oi) => (
                              <div
                                key={opt.option_id || oi}
                                className={`text-xs px-3 py-1.5 rounded-lg border ${
                                  opt.correct
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                    : "bg-slate-800 border-slate-700 text-slate-400"
                                }`}
                              >
                                <span className="font-semibold mr-1">{String.fromCharCode(65 + oi)}.</span>
                                {opt.text}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Explanation */}
                        {q.explanation && (
                          <div className="mb-3 pl-9">
                            <p className="text-[11px] text-slate-500 italic">{q.explanation}</p>
                          </div>
                        )}

                        {/* Verify controls */}
                        <div className="pl-9">
                          <VerifyControls
                            question={q}
                            onVerified={handleQuestionVerified}
                            onEdit={() => setEditingQuestion(q)}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── Edit Modal ── */}
      {editingQuestion && (
        <EditQuestionModal
          question={editingQuestion}
          onSaved={handleQuestionEdited}
          onClose={() => setEditingQuestion(null)}
        />
      )}
    </div>
  );
}