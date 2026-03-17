/**
 * QuizDetailModal.jsx  (v2 — TUTOR VERIFICATION)
 *
 * CHANGES:
 *   ✅ Added VerificationBadge component — shows pending/approved/rejected status
 *   ✅ Added VerifyControls — approve/reject buttons with rejection reason input
 *   ✅ handleVerifyQuestion — PATCH /api/admin/questions/:id/verify
 *   ✅ Verification status shown on every question row
 *   ✅ Verification summary shown in modal header (X/Y approved)
 */

import { useState, useEffect } from "react";
import QuizSettingsExtras from "./QuizSettingsExtras";
import DownloadXlsxButton from "./DownloadExcelButton";

const API = import.meta.env.VITE_API_BASE_URL || "";

function adminFetch(url, opts = {}) {
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

// ─── Helper: get admin role from token ───────────────────────────────────────
function getAdminRole() {
  try {
    const token = localStorage.getItem("admin_token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role || null;
  } catch {
    return null;
  }
}

// ─── Verification Badge ───────────────────────────────────────────────────────
function VerificationBadge({ status }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" d="M12 8v4m0 4h.01" />
      </svg>
      Pending
    </span>
  );
}

// ─── Verify Controls (approve / reject buttons) ───────────────────────────────
function VerifyControls({ question, onVerified }) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const current = question.tutor_verification?.status || "pending";

  const handleVerify = async (status, rejection_reason = null) => {
    setLoading(true);
    try {
      const body = { status };
      if (rejection_reason) body.rejection_reason = rejection_reason;
      const res = await adminFetch(`/api/admin/questions/${question.question_id}/verify`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Verification failed");
        return;
      }
      const data = await res.json();
      onVerified(data.question);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
      setShowReject(false);
      setReason("");
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <VerificationBadge status={current} />

        {/* Approve button — hide if already approved */}
        {current !== "approved" && (
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
        )}

        {/* Reject button — hide if already rejected */}
        {current !== "rejected" && (
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
        )}

        {/* Reset to pending (if already approved or rejected) */}
        {current !== "pending" && (
          <button
            disabled={loading}
            onClick={() => handleVerify("pending")}
            className="text-[10px] text-slate-500 hover:text-slate-300 underline transition disabled:opacity-40"
          >
            Reset
          </button>
        )}

        {question.tutor_verification?.verified_by && (
          <span className="text-[10px] text-slate-600">
            by {question.tutor_verification.verified_by}
          </span>
        )}
      </div>

      {/* Rejection reason input */}
      {showReject && (
        <div className="flex items-center gap-2 mt-1">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            className="flex-1 bg-slate-800 border border-red-600/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-red-500"
            onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) handleVerify("rejected", reason); }}
          />
          <button
            disabled={!reason.trim() || loading}
            onClick={() => handleVerify("rejected", reason)}
            className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-40"
          >
            Confirm
          </button>
          <button
            onClick={() => { setShowReject(false); setReason(""); }}
            className="text-xs text-slate-500 hover:text-white transition"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Show rejection reason if rejected */}
      {current === "rejected" && question.tutor_verification?.rejection_reason && (
        <p className="text-[10px] text-red-400/80 italic">
          Reason: {question.tutor_verification.rejection_reason}
        </p>
      )}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel({ settingsForm, setSettingsForm, onSave, onCancel, saving }) {
  return (
    <div className="border border-indigo-500/20 rounded-xl bg-indigo-500/5 p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Quiz Name</label>
          <input
            value={settingsForm.quiz_name || ""}
            onChange={(e) => setSettingsForm((f) => ({ ...f, quiz_name: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Time Limit (min)</label>
          <input
            type="number"
            value={settingsForm.time_limit_minutes ?? ""}
            onChange={(e) => setSettingsForm((f) => ({ ...f, time_limit_minutes: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Difficulty</label>
          <select
            value={settingsForm.difficulty || ""}
            onChange={(e) => setSettingsForm((f) => ({ ...f, difficulty: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            <option value="">None</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Max Attempts</label>
          <input
            type="number"
            value={settingsForm.max_attempts ?? ""}
            onChange={(e) => setSettingsForm((f) => ({ ...f, max_attempts: e.target.value === "" ? null : Number(e.target.value) }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
          />
        </div>
      </div>
      <QuizSettingsExtras form={settingsForm} onChange={(updater) =>
        setSettingsForm((prev) => typeof updater === "function" ? updater(prev) : { ...prev, ...updater })
      } />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" checked={settingsForm.is_active !== false} onChange={(e) => setSettingsForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded" />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer ml-4">
          <input type="checkbox" checked={!!settingsForm.is_trial} onChange={(e) => setSettingsForm((f) => ({ ...f, is_trial: e.target.checked }))} className="rounded" />
          Trial Quiz
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition">Cancel</button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

// ─── Main: QuizDetailModal ────────────────────────────────────────────────────
export default function QuizDetailModal({ quizId, onClose, onRefresh }) {
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editSettings, setEditSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});
  const [savingSettings, setSavingSettings] = useState(false);

  const adminRole = getAdminRole();
  const canVerify = ["admin", "super_admin", "tutor"].includes(adminRole);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setQuiz(data);
      setQuestions(data.questions || []);
      setSettingsForm({
        quiz_name: data.quiz_name || "",
        time_limit_minutes: data.time_limit_minutes ?? "",
        difficulty: data.difficulty || "",
        is_active: data.is_active !== false,
        is_trial: data.is_trial || false,
        randomize_questions: data.randomize_questions || false,
        randomize_options: data.randomize_options || false,
        max_attempts: data.max_attempts ?? null,
        attempts_enabled: data.attempts_enabled ?? false,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (quizId) fetchDetail(); }, [quizId]);

  // Update a single question in local state after verification (no full reload)
  const handleQuestionVerified = (updatedQuestion) => {
    setQuestions((prev) =>
      prev.map((q) => q.question_id === updatedQuestion.question_id ? updatedQuestion : q)
    );
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!confirm("Delete this question?")) return;
    try {
      const res = await adminFetch(`/api/admin/questions/${questionId}?quiz_id=${quizId}`, { method: "DELETE" });
      if (res.ok) fetchDetail(); else alert("Delete failed");
    } catch (err) { alert(err.message); }
  };

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      const res = await adminFetch(`/api/admin/quizzes/${quizId}`, {
        method: "PATCH",
        body: JSON.stringify({
          quiz_name: settingsForm.quiz_name,
          time_limit_minutes: settingsForm.time_limit_minutes === "" ? null : Number(settingsForm.time_limit_minutes),
          difficulty: settingsForm.difficulty || null,
          is_active: settingsForm.is_active,
          is_trial: settingsForm.is_trial,
          randomize_questions: settingsForm.randomize_questions,
          randomize_options: settingsForm.randomize_options,
          max_attempts: settingsForm.max_attempts,
        }),
      });
      if (res.ok) { setEditSettings(false); fetchDetail(); onRefresh?.(); }
      else { const d = await res.json(); alert(d.error || "Save failed"); }
    } catch (err) { alert(err.message); }
    finally { setSavingSettings(false); }
  };

  // ─── Verification summary counts ──────────────────────────────────────────
  const verStats = questions.reduce(
    (acc, q) => {
      const s = q.tutor_verification?.status || "pending";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    { approved: 0, rejected: 0, pending: 0 }
  );

  if (!quizId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl mx-4 my-8 shadow-2xl">

        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 rounded-t-2xl px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{quiz?.quiz_name || "Loading..."}</h2>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                {quiz && (
                  <>
                    <span>Year {quiz.year_level}</span>
                    <span>•</span>
                    <span>{quiz.subject}</span>
                    <span>•</span>
                    <span>{questions.length} questions</span>
                    {quiz.time_limit_minutes && (
                      <><span>•</span><span className="text-amber-400">⏱ {quiz.time_limit_minutes} min</span></>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Verification summary pill */}
              {questions.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs">
                  <span className="text-emerald-400 font-semibold">{verStats.approved}✓</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-red-400 font-semibold">{verStats.rejected}✗</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-amber-400 font-semibold">{verStats.pending}⋯</span>
                  <span className="text-slate-500">/ {questions.length}</span>
                </div>
              )}

              <DownloadXlsxButton quizId={quizId} quizName={quiz?.quiz_name} />

              <button
                onClick={() => setEditSettings(!editSettings)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition"
              >
                ⚙️ Settings
              </button>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm">Loading questions...</div>
          ) : (
            <>
              {/* Settings panel */}
              {editSettings && (
                <SettingsPanel
                  settingsForm={settingsForm}
                  setSettingsForm={setSettingsForm}
                  onSave={handleSaveSettings}
                  onCancel={() => setEditSettings(false)}
                  saving={savingSettings}
                />
              )}

              {/* Questions list */}
              {questions.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No questions in this quiz.</p>
              ) : (
                <div className="space-y-3">
                  {questions.map((q, idx) => {
                    const verStatus = q.tutor_verification?.status || "pending";
                    const borderColor =
                      verStatus === "approved"
                        ? "border-emerald-500/30"
                        : verStatus === "rejected"
                        ? "border-red-500/30"
                        : "border-slate-700";

                    return (
                      <div
                        key={q.question_id}
                        className={`bg-slate-800/50 border ${borderColor} rounded-xl p-4 transition-colors`}
                      >
                        {/* Question header row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <span className="text-xs font-mono text-slate-500 pt-0.5 shrink-0">
                              Q{idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-200 leading-relaxed">{q.text}</p>

                              {/* Image thumbnail */}
                              {q.image_url && (
                                <img
                                  src={q.image_url}
                                  alt=""
                                  className="mt-2 max-h-24 rounded-lg border border-slate-700 object-contain"
                                />
                              )}

                              {/* Options */}
                              {q.options?.length > 0 && (
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                                  {q.options.map((opt) => (
                                    <div
                                      key={opt.option_id}
                                      className={`text-xs px-2.5 py-1.5 rounded-lg border ${
                                        opt.correct
                                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                          : "bg-slate-900/50 border-slate-700 text-slate-400"
                                      }`}
                                    >
                                      {opt.text || (opt.image_url && "🖼 Image option") || "—"}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Short answer */}
                              {q.type === "short_answer" && q.correct_answer && (
                                <p className="mt-1.5 text-xs text-emerald-400">
                                  ✓ Answer: {q.correct_answer}
                                </p>
                              )}

                              {/* Meta tags */}
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">
                                  {q.type}
                                </span>
                                <span className="text-[10px] text-slate-500">{q.points}pt</span>
                                {q.sub_topic && (
                                  <span className="text-[10px] text-slate-500">{q.sub_topic}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleDeleteQuestion(q.question_id)}
                              className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition"
                            >
                              Del
                            </button>
                          </div>
                        </div>

                        {/* ✅ Verification controls */}
                        {canVerify && (
                          <div className="mt-3 pt-3 border-t border-slate-700/50">
                            <VerifyControls
                              question={q}
                              onVerified={handleQuestionVerified}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}