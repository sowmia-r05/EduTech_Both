function QuizHeader({ activeTab, onTabChange, quizName, displayName, isParentViewing, onBack, onBackToParent, isWriting }) {
  const navigate = useNavigate();

  return (
    <>
      <style>{`
        .qh-nav {
          background: #fff;
          border-bottom: 1px solid #E5E7EB;
          height: 58px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          position: sticky;
          top: 0;
          z-index: 100;
          gap: 12px;
          box-sizing: border-box;
        }
        .qh-pills {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          background: #F1F5F9;
          border-radius: 10px;
          padding: 4px;
          gap: 4px;
          z-index: 1;
        }
        .qh-quizname {
          font-size: 13px;
          color: #6B7280;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
        }
        /* Phones: stop centering pills absolutely; let them sit inline and shrink */
        @media (max-width: 768px) {
          .qh-nav { padding: 0 12px; }
          .qh-pills {
            position: static;
            left: auto;
            transform: none;
          }
          .qh-quizname { display: none; }
        }
      `}</style>

      <nav className="qh-nav">

        {/* ── Left: KAI logo ── */}
        <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
          <div style={{
            width:36, height:36, borderRadius:9,
            background:"linear-gradient(135deg,#7C3AED,#6D28D9)",
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3"  y="3"  width="7" height="7"/>
              <rect x="14" y="3"  width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3"  y="14" width="7" height="7"/>
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#111827", whiteSpace:"nowrap" }}>KAI Solutions</div>
            <div style={{ fontSize:10, color:"#9CA3AF", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>NAPLAN PREP</div>
          </div>
        </div>

        {/* ── Centre: Tab pills ── */}
        <div className="qh-pills">
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
          <span className="qh-quizname">{quizName}</span>
          <ChildAvatarMenu
            displayName={displayName}
            isParentViewing={isParentViewing || false}
            onBackToChildDashboard={onBack}
            onBackToParent={onBackToParent}
            isOnAnalyticsPage={false}
          />
        </div>
      </nav>
    </>
  );
}