/**
 * TutorDashboard.jsx
 *
 * ✅ FIXED: tutor_token / tutor_info separate from admin session
 * ✅ Image zoom modal
 * ✅ Explanation labeled clearly
 * ✅ Category badge displayed prominently
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

const API = import.meta.env.VITE_API_BASE_URL || "";

function tutorFetch(url, opts = {}) {
  const token = localStorage.getItem("tutor_token");
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(opts.headers || {}),
  };
  if (!headers["Content-Type"] && typeof opts.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${API}${url}`, { ...opts, headers, credentials: "include" });
}

// ─── Image Zoom Modal ─────────────────────────────────────────────────────────
function ImageZoomModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center">
        <img
          src={src}
          alt="Zoomed"
          className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 bg-black/60 hover:bg-black/90 text-white rounded-full flex items-center justify-center text-lg transition"
        >
          ✕
        </button>
        <p className="absolute bottom-3 text-xs text-slate-400">Click outside to close</p>
      </div>
    </div>
  );
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

// ─── Verify Controls ─────────────────────────────────────────────────────────
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
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Failed"); return; }
      const data = await res.json();
      onVerified(data.question);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); setShowReject(false); setReason(""); }
  };

  if (current === "approved") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <VerificationBadge status="approved" />
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
    );
  }

  if (current === "rejected") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <VerificationBadge status="rejected" />
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
  const [tutorInfo,      setTutorInfo]      = useState(null);
  const [quizzes,        setQuizzes]        = useState([]);
  const [selectedQuiz,   setSelectedQuiz]   = useState(null);
  const [questions,      setQuestions]      = useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [loadingQs,      setLoadingQs]      = useState(false);
  const [filter,         setFilter]         = useState("all");
  const [zoomedImage,    setZoomedImage]    = useState(null);

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

  const handleLogout = async () => {
    try { await tutorFetch("/api/admin/logout", { method: "POST" }); } catch {}
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
    <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col overflow-hidden">

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

      <div className="flex flex-1 max-w-7xl mx-auto w-full px-6 py-6 gap-6 overflow-hidden">

        {/* ── Left: Quiz List ── */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">
              Assigned Quizzes
              <span className="ml-2 text-[11px] text-slate-500 font-normal">({quizzes.length})</span>
            </h2>
            <button
              onClick={fetchQuizzes}
              disabled={loadingQuizzes}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loadingQuizzes ? "Refreshing…" : "Refresh"}
            </button>
          </div>

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
        <main className="flex-1 min-w-0 bg-slate-950 overflow-y-auto h-full">
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
              <div className="space-y-3 pb-6">
                {filteredQuestions.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-sm">No questions match this filter</div>
                ) : (
                  filteredQuestions.map((q, idx) => {
                    const status = q.tutor_verification?.status || "pending";
                    return (
                      <div
                        key={q.question_id}
                        className={`bg-slate-900 border rounded-xl p-5 transition ${
                          status === "approved" ? "border-emerald-800/40" :
                          status === "rejected" ? "border-red-800/40" :
                          "border-slate-800"
                        }`}
                      >
                        {/* ── Category + Sub-category badges ── */}
                            {(q.category || q.sub_category || q.subcategory || q.sub_topic) && (
                              <div className="flex items-center gap-2 flex-wrap mb-3">
                                {/* Category — indigo */}
                                {q.category && (
                                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/15 border border-indigo-500/30 rounded-lg">
                                    <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-indigo-300">{q.category}</span>
                                  </div>
                                )}
                                {/* Sub-category — violet */}
                                {(q.sub_category || q.subcategory) && (
                                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/15 border border-violet-500/30 rounded-lg">
                                    <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    <span className="text-sm font-semibold text-violet-300">{q.sub_category || q.subcategory}</span>
                                  </div>
                                )}
                                {/* Sub-topic — cyan ← THIS IS THE NEW ONE */}
                                {q.sub_topic && (
                                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/15 border border-cyan-500/30 rounded-lg">
                                    <svg className="w-4 h-4 text-cyan-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-cyan-300">{q.sub_topic}</span>
                                  </div>
                                )}
                              </div>
                            )}
                        {/* ── Question number + text ── */}
                        <div className="flex items-start gap-3 mb-4">
                          <span className="text-xs font-bold text-slate-600 bg-slate-800 rounded-md px-2 py-1 flex-shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0 space-y-3">
                            {/* Question text — renders HTML properly */}
                            <div
                              className="text-sm text-white leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: q.text }}
                            />

                            {/* Question image with zoom */}
                            {q.image_url && (
                              <div
                                className="relative inline-block group cursor-zoom-in"
                                onClick={() => setZoomedImage(q.image_url)}
                              >
                                <img
                                  src={q.image_url}
                                  alt=""
                                  className="max-h-48 rounded-xl object-contain border border-slate-700 transition group-hover:border-indigo-500/60"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl transition flex items-center justify-center">
                                  <span className="opacity-0 group-hover:opacity-100 transition bg-black/70 text-white text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                    </svg>
                                    Click to zoom
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Options ── */}
                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 mb-4 pl-9">
                            {q.options.map((opt, oi) => {
                              const isCorrect = opt.correct === true || opt.correct === "true";
                              return (
                                <div
                                  key={opt.option_id || oi}
                                  className={`text-xs px-3 py-2 rounded-lg border flex items-center gap-2 ${
                                    isCorrect
                                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                      : "bg-slate-800 border-slate-700 text-slate-400"
                                  }`}
                                >
                                  <span className="font-bold flex-shrink-0">{String.fromCharCode(65 + oi)}.</span>
                                  <span className="flex-1">{opt.text}</span>
                                  {isCorrect && (
                                    <span className="text-emerald-400 flex-shrink-0 font-bold">✓</span>
                                  )}
                                  {/* Option image with zoom */}
                                  {opt.image_url && (
                                    <img
                                      src={opt.image_url}
                                      alt=""
                                      className="h-10 rounded object-contain cursor-zoom-in border border-slate-600 hover:border-indigo-400 flex-shrink-0"
                                      onClick={() => setZoomedImage(opt.image_url)}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Explanation ── */}
                        {q.explanation && (
                          <div className="mb-4 pl-9">
                            <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-4">
                              {/* Explanation header */}
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                  </svg>
                                </div>
                                <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Explanation</span>
                              </div>
                              {/* Explanation text */}
                              <p className="text-sm text-amber-100/80 leading-relaxed">{q.explanation}</p>
                            </div>
                          </div>
                        )}

                        {/* ── Verify controls ── */}
                        <div className="pl-9">
                          <VerifyControls question={q} onVerified={handleQuestionVerified} />
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

      {/* ── Image Zoom Modal ── */}
      <ImageZoomModal src={zoomedImage} onClose={() => setZoomedImage(null)} />

    </div>
  );
}