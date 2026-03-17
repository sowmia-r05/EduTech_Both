/**
 * TutorDashboard.jsx
 *
 * Tutor's workspace:
 *   - Left: list of assigned quizzes with verification progress bar
 *   - Right: selected quiz with all questions + approve/reject controls
 *
 * All data fetched from /api/tutor/* endpoints.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_PATH } from "@/app/App";

const API = import.meta.env.VITE_API_BASE_URL || "";

function tutorFetch(url, opts = {}) {
  const token = localStorage.getItem("admin_token");
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

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <VerificationBadge status={current} />

        {current !== "approved" && (
          <button disabled={loading} onClick={() => { setShowReject(false); handleVerify("approved"); }}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg transition disabled:opacity-40">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Approve
          </button>
        )}

        {current !== "rejected" && (
          <button disabled={loading} onClick={() => setShowReject((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-lg transition disabled:opacity-40">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            Reject
          </button>
        )}

        {current !== "pending" && (
          <button disabled={loading} onClick={() => handleVerify("pending")}
            className="text-[10px] text-slate-500 hover:text-slate-300 underline disabled:opacity-40">
            Reset
          </button>
        )}

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
            className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-40">
            Confirm
          </button>
          <button onClick={() => { setShowReject(false); setReason(""); }} className="text-xs text-slate-500 hover:text-white">Cancel</button>
        </div>
      )}

      {current === "rejected" && question.tutor_verification?.rejection_reason && (
        <p className="text-[10px] text-red-400/80 italic">Reason: {question.tutor_verification.rejection_reason}</p>
      )}
    </div>
  );
}

// ─── Main TutorDashboard ──────────────────────────────────────────────────────
export default function TutorDashboard() {
  const navigate = useNavigate();
  const [tutorInfo,     setTutorInfo]     = useState(null);
  const [quizzes,       setQuizzes]       = useState([]);
  const [selectedQuiz,  setSelectedQuiz]  = useState(null);
  const [questions,     setQuestions]     = useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [loadingQs,     setLoadingQs]     = useState(false);
  const [filter,        setFilter]        = useState("all"); // all | pending | approved | rejected

  const tutorData = (() => {
    try { return JSON.parse(localStorage.getItem("admin_info") || "{}"); } catch { return {}; }
  })();

  const fetchQuizzes = useCallback(async () => {
    try {
      setLoadingQuizzes(true);
      const res = await tutorFetch("/api/tutor/quizzes");
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_info");
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
    // load tutor profile
    tutorFetch("/api/tutor/me")
      .then((r) => r.json())
      .then((d) => { if (d.tutor) setTutorInfo(d.tutor); })
      .catch(() => {});
  }, [fetchQuizzes]);

  const handleQuestionVerified = (updatedQ) => {
    setQuestions((prev) => prev.map((q) => q.question_id === updatedQ.question_id ? updatedQ : q));
    // Update stats in quiz list
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
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_info");
    navigate(`${ADMIN_PATH}/tutor`);
  };

  const filteredQuestions = questions.filter((q) => {
    const s = q.tutor_verification?.status || "pending";
    if (filter === "all") return true;
    return s === filter;
  });

  // Verification summary for selected quiz
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
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : quizzes.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
              <p className="text-slate-500 text-sm">No quizzes assigned yet.</p>
              <p className="text-slate-600 text-xs mt-1">Ask your admin to assign quizzes.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {quizzes.map((qz) => {
                const isSelected = selectedQuiz?.quiz_id === qz.quiz_id;
                const v = qz.verification || {};
                const allDone = v.total > 0 && v.approved === v.total;
                return (
                  <button key={qz.quiz_id}
                    onClick={() => fetchQuizDetail(qz.quiz_id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-indigo-600/20 border-indigo-500/40"
                        : "bg-slate-900 border-slate-800 hover:border-slate-700"
                    }`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white leading-tight">{qz.quiz_name}</p>
                      {allDone && <span className="text-emerald-400 text-xs flex-shrink-0">✓ Done</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Year {qz.year_level} · {qz.subject}
                    </p>
                    <ProgressBar approved={v.approved || 0} total={v.total || qz.question_count || 0} />
                    {v.rejected > 0 && (
                      <p className="text-[10px] text-red-400 mt-1">{v.rejected} rejected</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* ── Right: Question Verification ── */}
        <main className="flex-1 min-w-0">
          {!selectedQuiz && !loadingQs && (
            <div className="flex items-center justify-center h-64">
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
                  {/* Verification summary pill */}
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
                  <div className="text-center py-12 text-slate-500">No questions match this filter.</div>
                ) : (
                  filteredQuestions.map((q, idx) => {
                    const verStatus   = q.tutor_verification?.status || "pending";
                    const borderColor = verStatus === "approved" ? "border-emerald-500/30"
                                      : verStatus === "rejected"  ? "border-red-500/30"
                                      : "border-slate-700/50";

                    return (
                      <div key={q.question_id} className={`bg-slate-900 border ${borderColor} rounded-xl p-5`}>

                        {/* Question number + type + points */}
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <span className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center text-[11px] font-bold text-indigo-400 flex-shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded border bg-slate-800 border-slate-700 text-slate-400">
                            {q.type?.replace("_", " ")}
                          </span>
                          <span className="text-[10px] text-slate-500">{q.points}pt</span>
                          {q.categories?.[0]?.name && (
                            <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{q.categories[0].name}</span>
                          )}
                        </div>

                        {/* Question text */}
                        <p className="text-sm text-slate-200 leading-relaxed mb-3 ml-8"
                          dangerouslySetInnerHTML={{ __html: q.text }} />

                        {/* Image */}
                        {q.image_url && (
                          <div className="mb-3 ml-8">
                            <img src={q.image_url} alt="" className="max-h-40 rounded-lg border border-slate-700 object-contain" />
                          </div>
                        )}

                        {/* Options */}
                        {q.options?.length > 0 && (
                          <div className="space-y-1.5 ml-8 mb-3">
                            {q.options.map((opt, oi) => (
                              <div key={opt.option_id || oi}
                                className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                                  opt.correct ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-slate-800/50"
                                }`}>
                                <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                                  opt.correct ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400"
                                }`}>
                                  {opt.correct ? "✓" : String.fromCharCode(65 + oi)}
                                </span>
                                <span className="text-slate-300">{opt.text}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Short answer */}
                        {q.type === "short_answer" && q.correct_answer && (
                          <div className="ml-8 mb-3 px-3 py-2 bg-orange-500/5 border border-orange-500/10 rounded-lg">
                            <p className="text-[10px] text-orange-400 font-bold mb-0.5">✍️ Answer</p>
                            <p className="text-xs text-orange-300">{q.correct_answer}</p>
                          </div>
                        )}

                        {/* Explanation */}
                        {q.explanation && (
                          <div className="ml-8 mb-3 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                            <p className="text-[10px] text-amber-500 font-bold mb-0.5">Explanation</p>
                            <p className="text-xs text-amber-400/80">{q.explanation}</p>
                          </div>
                        )}

                        {/* Verify controls */}
                        <div className="mt-3 pt-3 border-t border-slate-800 ml-8">
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
    </div>
  );
}
