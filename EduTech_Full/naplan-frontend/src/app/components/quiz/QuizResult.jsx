import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth }     from "@/app/context/AuthContext";
import AnswersModal    from "./AnswersModal";
import ChildAvatarMenu from "@/app/components/ui/ChildAvatarMenu";






/* ═══════════════════════════════════════════
   SELF-CONTAINED HEADER
   KAI logo  |  Tab pills  |  Quiz name + Avatar
   ═══════════════════════════════════════════ */
function QuizHeader({ activeTab, onTabChange, quizName, displayName, isParentViewing, onBack, onBackToParent }) {
  const navigate = useNavigate();

  return (
    <nav style={{
      background:    "#fff",
      borderBottom:  "1px solid #E5E7EB",
      height:        "58px",
      display:       "flex",
      alignItems:    "center",
      justifyContent:"space-between",
      padding:       "0 24px",
      position:      "sticky",
      top:           0,
      zIndex:        100,
      gap:           16,
    }}>

      {/* ── Left: KAI logo (identical to DashboardHeader.jsx) ── */}
      <div
        style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}
      >
        <div style={{
          width:36, height:36, borderRadius:9,
          background:"linear-gradient(135deg,#7C3AED,#6D28D9)",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3"  y="3"  width="7" height="7"/>
            <rect x="14" y="3"  width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3"  y="14" width="7" height="7"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>KAI Solutions</div>
          <div style={{ fontSize:10, color:"#9CA3AF", letterSpacing:"0.08em" }}>NAPLAN PREP</div>
        </div>
      </div>

      {/* ── Centre: Tab pills ── */}
      <div style={{
        position:"absolute",
        left:"50%",
        transform:"translateX(-50%)",
        display:"flex", alignItems:"center",
        background:"#F1F5F9", borderRadius:10, padding:4, gap:4,
        zIndex:1,
      }}>
        {[
          {
            id: 0, label: "Results",
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
            ),
          },
          {
            id: 1, label: "AI Feedback",
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3c-1 2.5-3.5 4-3.5 4S12 8.5 12 12c0-3.5 3.5-5 3.5-5S13 5.5 12 3z"/>
                <path d="M5 14c-.5 1.5-2 2.5-2 2.5S5 18 5 20c0-2 2.5-3 2.5-3S5.5 15.5 5 14z"/>
                <path d="M19 14c.5 1.5 2 2.5 2 2.5S19 18 19 20c0-2-2.5-3-2.5-3S18.5 15.5 19 14z"/>
              </svg>
            ),
          },
        ].map(tab => (
          <button key={tab.id} onClick={() => onTabChange(tab.id)} style={{
            display:"flex", alignItems:"center", gap:6,
            padding:"6px 16px", borderRadius:8,
            border:     activeTab === tab.id ? "1px solid #E2E8F0" : "1px solid transparent",
            background: activeTab === tab.id ? "#fff" : "transparent",
            boxShadow:  activeTab === tab.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            color:      activeTab === tab.id ? "#1E293B" : "#64748B",
            fontWeight: 600, fontSize:14, cursor:"pointer",
            transition:"all 0.15s", whiteSpace:"nowrap",
          }}>
            <span style={{ color: activeTab === tab.id ? (tab.id === 1 ? "#7C3AED" : "#2563EB") : "#94A3B8" }}>
              {tab.icon}
            </span>
            {tab.label}
            {tab.id === 1 && (
              <span style={{
                fontSize:9, fontWeight:700, letterSpacing:"0.06em",
                padding:"2px 5px", borderRadius:4,
                background: activeTab === 1 ? "linear-gradient(135deg,#7C3AED,#6D28D9)" : "#E5E7EB",
                color: activeTab === 1 ? "#fff" : "#9CA3AF",
              }}>AI</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Right: Quiz name (truncated) + Avatar ── */}
      <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0, flexShrink:0 }}>
        <span style={{
          fontSize:13, color:"#6B7280", fontWeight:500,
          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:220,
        }}>
          {quizName}
        </span>
        <ChildAvatarMenu
          displayName={displayName}
          isParentViewing={isParentViewing || false}
          onBackToChildDashboard={onBack}
          onBackToParent={onBackToParent}
          isOnAnalyticsPage={false}
        />
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════
   SCORE RING  (Results tab)
   ═══════════════════════════════════════════ */
function ScoreRing({ percentage }) {
  const R = 52, C = 2 * Math.PI * R;
  const color = percentage >= 85 ? "#059669" : percentage >= 70 ? "#d97706"
              : percentage >= 50 ? "#2563eb" : "#dc2626";
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#f1f5f9" strokeWidth="8"/>
        <circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={C}
          strokeDashoffset={C - (percentage/100)*C}
          className="transition-all duration-1000 ease-out"/>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold text-slate-800">{percentage}%</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TOPIC BREAKDOWN  (Results tab)
   ═══════════════════════════════════════════ */
function TopicBreakdown({ entries }) {
  const [open, setOpen] = useState(false);
  if (!entries?.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
        Topic Breakdown
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180":""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-slate-100">
          {entries.map(([name, { scored, total }]) => {
            const pct = total > 0 ? Math.round((scored/total)*100) : 0;
            const bar = pct>=80?"bg-emerald-500":pct>=50?"bg-amber-400":"bg-red-500";
            const txt = pct>=80?"text-emerald-600":pct>=50?"text-amber-600":"text-red-600";
            return (
              <div key={name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 font-medium truncate max-w-[70%]">{name}</span>
                  <span className={`font-semibold ${txt}`}>{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${bar}`} style={{ width:`${pct}%` }}/>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */
const buildTopicStrength = (tb={}) => {
  const strong=[], weak=[];
  Object.entries(tb).forEach(([topic,v]) => {
    const total=Number(v?.total)||0, scored=Number(v?.scored)||0;
    if (!total) return;
    const p=scored/total;
    if (p>=0.75) strong.push({ topic, accuracy:p });
    else if (p<=0.5) weak.push({ topic, lostMarks:total-scored });
  });
  return { strongTopics:strong, weakTopics:weak.sort((a,b)=>b.lostMarks-a.lostMarks) };
};



const buildSuggestions = (fb) => {
  if (!fb) return [];
  const list=[];
  if (fb.overall_feedback) list.push({ title:"Overall Feedback", description:fb.overall_feedback });
  (fb.strengths||[]).forEach(s=>list.push({ title:"Strength", description:s }));
  (fb.weaknesses||[]).forEach(w=>list.push({ title:"Weak Area", description:w }));
  (fb.growth_areas||[]).forEach(g=>{ if(g) list.push({ title:"Improvement", description:g }); });
  (fb.areas_of_improvement||[]).forEach(a=>{
    const d=[a?.issue,a?.how_to_improve].filter(Boolean).join(" — ");
    if(d) list.push({ title:"Improvement", description:d });
  });
  if (fb.encouragement) list.push({ title:"Encouragement", description:fb.encouragement });
  return list;
};

const fmtDuration = s => {
  const n=Number(s);
  if (!Number.isFinite(n)||n<=0) return "—";
  const m=Math.floor(n/60), r=Math.round(n%60);
  return m<=0?`${r}s`:`${m}m ${r}s`;
};

const getStatus = pct =>
  pct>=85?{ label:"Outstanding",  cls:"text-emerald-600" }:
  pct>=70?{ label:"Well Done",    cls:"text-emerald-600" }:
  pct>=50?{ label:"On Track",     cls:"text-amber-600"   }:
  pct>=30?{ label:"Developing",   cls:"text-amber-600"   }:
          { label:"More Practice",cls:"text-red-600"     };




/* ═══════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════ */
export default function QuizResult({
  result           = {},
  quizName         = "Quiz",
  violations       = 0,
  onClose,
  onRetake,
  onViewAnalytics,
  onViewAIFeedback,
  childStatus:     childStatusProp,
  displayName,        
  isParentViewing,    
  childId,
  attemptsExhausted = false,
  attemptCount = null,
}) {
  const navigate = useNavigate();
  const { childProfile, apiFetch, childToken, parentToken } = useAuth();
  const authRef = useRef({ childProfile });
  useEffect(() => { authRef.current = { childProfile }; }, [childProfile]);

  const [activeTab,        setActiveTab]        = useState(0);
  const [showAnswers,      setShowAnswers]       = useState(false);
  const [aiPollStatus,     setAiPollStatus]      = useState(null);  // "done"|"error"|null
  const [subscriptionStatus, setSubscriptionStatus] = useState(childStatusProp || null); // "trial"|"active"|null


  const score      = result.score           || {};
  const topics     = result.topic_breakdown || {};
  const isWriting  = result.is_writing      || false;
  const aiStatus   = result.ai_status       || null;
  const attemptId  = result.attempt_id || result.response_id || null;
  const percentage = score.percentage || 0;

  const resolvedName = displayName || childProfile?.displayName || "Student";

  /* AI status polling */
  useEffect(() => {
    if (!attemptId || !["queued","generating","pending"].includes(aiStatus)) return;
    const token = childToken || parentToken;
    let timer;
    const poll = async () => {
      try {
        const h = { Accept:"application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) };
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL||""}/api/attempts/${attemptId}/ai-status`, { headers:h });
        if (res.ok) {
          const d = await res.json();
          if (d.status==="done"||d.status==="ai_done") setAiPollStatus("done");
          else if (d.status==="error") setAiPollStatus("error");
          else timer = setTimeout(poll, 5000);
        }
      } catch {}
    };
    timer = setTimeout(poll, 5000);
    return () => clearTimeout(timer);
  }, [attemptId, aiStatus, childToken, parentToken]);


  /* fetch live child subscription status */
useEffect(() => {
  if (!childToken && !parentToken) return;
  // Use childStatusProp if already passed — no extra API call needed
  if (childStatusProp) {
    setSubscriptionStatus(childStatusProp);
    return;
  }
  (async () => {
    try {
      const res = await apiFetch("/api/auth/me");
      if (res.ok) { const d = await res.json(); setSubscriptionStatus(d.status || null); }
    } catch {}
  })();
}, [apiFetch, childToken, parentToken, childStatusProp]);




  const gradeLabel = useMemo(() => {
    if (percentage>=90) return "Outstanding!";
    if (percentage>=80) return "Great job!";
    if (percentage>=70) return "Good work!";
    if (percentage>=50) return "Keep practicing!";
    return "More practice needed";
  }, [percentage]);

  const topicEntries = useMemo(() =>
    Object.entries(topics).sort((a,b) => {
      const pA = a[1].total>0 ? a[1].scored/a[1].total : 0;
      const pB = b[1].total>0 ? b[1].scored/b[1].total : 0;
      return pA-pB;
    }), [topics]
  );

  const handleViewAnalytics = useCallback(() => {
    if (onViewAnalytics) onViewAnalytics();
    else navigate("/child-dashboard");
  }, [navigate, onViewAnalytics]);




  // Navigates to the full Dashboard.jsx for this attempt
  const handleViewDashboard = useCallback(() => {
    if (!attemptId) return;
    const { childProfile: cp } = authRef.current;
    navigate("/NonWritingLookupQuizResults/results", {
      state: {
        r: attemptId,
        username: cp?.username || null,
        subject: result?.subject || null,
        quiz_name: quizName || null,
      },
    });
  }, [navigate, attemptId, result?.subject, quizName]);


  /* ── shared icon SVGs ── */
  const IcAnswers = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
    </svg>
  );
  const IcAnalytics = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625z"/>
    </svg>
  );
  const IcAI = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
    </svg>
  );
  const IcRetake = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
    </svg>
  );
  const IcChevron = () => (
    <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
    </svg>
  );

  const ActionBtn = ({ onClick, icon, label, variant="default", badge }) => (
    <button onClick={onClick} className={`
      group w-full inline-flex items-center justify-between px-5 py-4 rounded-xl transition-all shadow-sm
      ${variant==="indigo"
        ? "border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300"
        : "border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"}
    `}>
      <span className="flex items-center gap-3">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors
          ${variant==="indigo"
            ? "bg-indigo-100 group-hover:bg-indigo-200 text-indigo-600"
            : "bg-slate-100 group-hover:bg-slate-200 text-slate-600"}`}>
          {icon}
        </span>
        <span className={`text-sm font-semibold ${variant==="indigo"?"text-indigo-800":"text-slate-700"}`}>
          {label}
          {badge && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-200 text-indigo-700 uppercase tracking-wide">{badge}</span>}
        </span>
      </span>
      <IcChevron/>
    </button>
  );

  /* ════════════════════════════════════════
     RENDER
     ════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-slate-50">

      {/* ONE sticky bar: logo + tabs + avatar */}

      <QuizHeader
          activeTab={activeTab}
          quizName={quizName}
          displayName={resolvedName}
          isParentViewing={isParentViewing || false}
          onBack={onClose}
          onBackToParent={() => navigate("/parent-dashboard")}
          onTabChange={(tabId) => {
            if (tabId === 0) {
              setActiveTab(0);
              return;
            }
            if (!attemptId) return;
            const cp = authRef.current?.childProfile;
            const state = {
              r:              attemptId,
              username:       cp?.username || null,
              subject:        result?.subject || null,
              quiz_name:      quizName || null,
              fromQuizResult: true,
            };
            if (onViewAIFeedback) {
              onViewAIFeedback(attemptId, result?.subject, quizName);
            } else {
              navigate(
                isWriting ? "/writing-feedback/result" : "/NonWritingLookupQuizResults/results",
                { state }
              );
            }
          }}
        />

      {/* ── TAB 1: RESULTS ── */}
      {activeTab === 0 && (
        <div className="px-4 py-8">
          <div className="max-w-xl mx-auto space-y-4">

            <div className="rounded-2xl overflow-hidden shadow-md border border-slate-200">
              {/* Gradient header strip */}
              <div style={{ background:"linear-gradient(135deg,#1E293B 0%,#334155 100%)" }} className="px-6 py-4 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-widest"
                  style={{ background:"rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.75)" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  QUIZ COMPLETE
                </div>
                <h1 className="text-white font-bold text-lg mt-2 leading-snug">{quizName}</h1>
              </div>

              {/* Score section */}
              <div className="bg-white px-8 py-6 text-center space-y-3">
                <div className="flex justify-center"><ScoreRing percentage={percentage}/></div>
                <div>
                  <p className="text-base font-bold text-slate-800">{gradeLabel}</p>
                  <div className="flex items-center justify-center gap-3 mt-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
                      {score.points||0} / {score.available||0} pts
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                      Grade {score.grade||"—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <TopicBreakdown entries={topicEntries}/>


            {/* Action buttons */}
            <div className="space-y-3 pt-2">
              {!isWriting && (
                <ActionBtn onClick={() => setShowAnswers(true)} icon={<IcAnswers/>} label="View My Answers"/>
              )}

              {/* ✅ FIX: Show disabled state if attempts exhausted, retake button if allowed */}
              {attemptsExhausted ? (
                <div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 text-sm font-semibold cursor-not-allowed">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  No Attempts Left ({attemptCount?.used}/{attemptCount?.max})
                </div>
              ) : onRetake ? (
                <ActionBtn onClick={onRetake} icon={<IcRetake/>} label="Retake Quiz"/>
              ) : null}
            </div>

          </div>
        </div>
      )}


    {/* ── TAB 1: AI FEEDBACK (non-writing — embedded iframe) ── */}

 
      {showAnswers && !isWriting && (
        <AnswersModal
          attemptId={attemptId}
          quizName={quizName}
          score={{...score, correct: score.points, total: score.available }}
          topics={topics}
          onClose={() => setShowAnswers(false)}
        />
      )}
 
    </div>
  );
}