/**
 * DashboardHeader.jsx
 *
 * Shared sticky header used across ALL dashboard screens.
 * Matches ParentDashboard nav exactly — same height, same logo, same styling.
 *
**/



export default function DashboardHeader({ children }) {
  

  return (
    <nav
      style={{
        background: "#fff",
        borderBottom: "1px solid #E5E7EB",
        padding: "0 40px",
        height: "58px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* ── Left: Logo — identical to ParentDashboard ── */}
      <div
        style={{ display: "flex", alignItems: "center", gap: "10px" }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "9px",
            background: "linear-gradient(135deg,#7C3AED,#6D28D9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="#fff" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
            KAI Solutions
          </div>
          <div style={{ fontSize: "10px", color: "#9CA3AF", letterSpacing: "0.08em" }}>
            NAPLAN PREP
          </div>
        </div>
      </div>

      {/* ── Right: context-aware actions (passed as children) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {children}
      </div>
    </nav>
  );
}
