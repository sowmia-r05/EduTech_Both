/**
 * DashboardHeader.jsx
 *
 * Shared sticky header used across ALL dashboard screens.
 * Matches ParentDashboard nav exactly — same height, same logo, same styling.
 *
 **/

const HEADER_CSS = `
  .dh-nav {
    background: #fff;
    border-bottom: 1px solid #E5E7EB;
    padding: 0 40px;
    height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    box-sizing: border-box;
  }
  .dh-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .dh-logo-text {
    min-width: 0;
  }
  .dh-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  /* Phones: shrink padding so the two sides stop colliding */
  @media (max-width: 640px) {
    .dh-nav {
      padding: 0 12px;
    }
  }
`;

export default function DashboardHeader({ children }) {
  return (
    <>
      <style>{HEADER_CSS}</style>
      <nav className="dh-nav">
        {/* ── Left: Logo ── */}
        <div className="dh-logo">
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "9px",
              background: "linear-gradient(135deg,#7C3AED,#6D28D9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
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
          <div className="dh-logo-text">
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>
              KAI Solutions
            </div>
            <div style={{ fontSize: "10px", color: "#9CA3AF", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
              NAPLAN PREP
            </div>
          </div>
        </div>

        {/* ── Right: context-aware actions (passed as children) ── */}
        <div className="dh-actions">
          {children}
        </div>
      </nav>
    </>
  );
}