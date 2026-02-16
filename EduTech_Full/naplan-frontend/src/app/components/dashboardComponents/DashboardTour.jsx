import { useEffect, useState, useMemo } from "react";
import Joyride, { STATUS } from "react-joyride";

/* ---------- Storage Key ---------- */
const TOUR_STORAGE_KEY = "dashboardTourCompleted";

/* ---------- Glow Utility ---------- */
const createGlow = (color, soft, strong = false) => ({
  "--glow-color": color,
  "--glow-soft": soft,
  animation: `spotlightBreathing ${strong ? "1s" : "1.6s"} ease-in-out infinite`,
  borderRadius: 14,
  transform: strong ? "scale(1.03)" : "none",
});

/* ---------- Glow Variants ---------- */
const glowBlue = createGlow(
  "rgba(37, 99, 235, 0.95)",
  "rgba(37, 99, 235, 0.5)"
);

const glowGreen = createGlow(
  "rgba(34, 197, 94, 0.95)",
  "rgba(34, 197, 94, 0.5)"
);

const glowPurple = createGlow(
  "rgba(168, 85, 247, 0.95)",
  "rgba(168, 85, 247, 0.5)"
);

const glowBlueStrong = createGlow(
  "rgba(37, 99, 235, 0.95)",
  "rgba(37, 99, 235, 0.5)",
  true
);

/* ---------- Reusable Tour Card ---------- */
const TourCard = ({ step, total, icon, title, description, tip }) => (
  <div style={{ lineHeight: 1.6 }}>
    <div
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: "#6B7280",
        marginBottom: 6,
      }}
    >
      Step {step} of {total}
    </div>

    <div
      style={{
        fontSize: 18,
        fontWeight: 600,
        marginBottom: 8,
        color: "#111827",
      }}
    >
      {icon} {title}
    </div>

    <div
      style={{
        fontSize: 14,
        color: "#374151",
        marginBottom: tip ? 12 : 0,
      }}
    >
      {description}
    </div>

    {tip && (
      <div
        style={{
          background: "#F3F4F6",
          padding: "10px 12px",
          borderRadius: 10,
          fontSize: 13,
          color: "#111827",
        }}
      >
        💡 {tip}
      </div>
    )}
  </div>
);

export default function DashboardTour({ isTourActive, setIsTourActive }) {
  const [run, setRun] = useState(false);

  /* ---------- Define Steps ---------- */
  const tourSteps = useMemo(() => {
    const total = 7;

    return [
      {
        target: "#overall-score",
        content: (
          <TourCard
            step={1}
            total={total}
            icon="🎯"
            title="Overall Performance Score"
            description="Your complete quiz performance snapshot. It reflects accuracy, question weighting, and overall mastery."
            tip="Track this over multiple attempts to measure real progress."
          />
        ),
        styles: { spotlight: glowBlueStrong },
      },
      {
        target: "#time-spent",
        content: (
          <TourCard
            step={2}
            total={total}
            icon="⏱"
            title="Time Analysis"
            description="See how long you took to complete the quiz. Speed matters — but only when accuracy stays strong."
            tip="Low score + low time? Slow down slightly and focus on clarity."
          />
        ),
        styles: { spotlight: glowGreen },
      },
      {
        target: "#ai-coach",
        content: (
          <TourCard
            step={3}
            total={total}
            icon="🤖"
            title="AI Coach Insights"
            description="Your AI Coach analyzes patterns in your answers, detects conceptual gaps, and identifies careless mistakes."
            tip="Review this feedback before your next attempt."
          />
        ),
        styles: { spotlight: glowPurple },
      },
      {
        target: "#donut-chart",
        content: (
          <TourCard
            step={4}
            total={total}
            icon="📊"
            title="Score Breakdown"
            description="This chart visualizes how your score is distributed across categories."
            tip="Uneven sections highlight your fastest improvement opportunities."
          />
        ),
        styles: { spotlight: glowBlue },
      },
      {
        target: "#weak-topics",
        content: (
          <TourCard
            step={5}
            total={total}
            icon="📉"
            title="Weak Topics"
            description="These topics contributed most to score reduction."
            tip="Prioritize revising these to unlock rapid score gains."
          />
        ),
        styles: { spotlight: glowGreen },
      },
      {
        target: "#top-topics",
        content: (
          <TourCard
            step={6}
            total={total}
            icon="🚀"
            title="Strong Topics"
            description="Your highest-performing areas — your scoring foundation."
            tip="Maintain them with light revision to keep your edge sharp."
          />
        ),
        styles: { spotlight: glowPurple },
      },
      {
        target: "#suggestions",
        content: (
          <TourCard
            step={7}
            total={total}
            icon="📚"
            title="Personalized Study Plan"
            description="AI-generated recommendations tailored to your weaknesses, timing patterns, and performance trends."
            tip="Follow this plan for focused, efficient improvement."
          />
        ),
        styles: { spotlight: glowBlue },
      },
    ];
  }, []);

  /* ---------- Start Tour ---------- */
  useEffect(() => {
    const hasCompletedTour = localStorage.getItem(TOUR_STORAGE_KEY);

    if (isTourActive && !hasCompletedTour) {
      setRun(true);
    }
  }, [isTourActive]);

  /* ---------- Joyride Callback ---------- */
  const handleJoyrideCallback = (data) => {
    const { status } = data;

    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      localStorage.setItem(TOUR_STORAGE_KEY, "true");
      setRun(false);
      setIsTourActive(false);
    }
  };

  return (
    <Joyride
      steps={tourSteps}
      run={run}
      continuous
      scrollToFirstStep
      scrollOffset={120}
      scrollDuration={500}
      showSkipButton
      showProgress
      disableOverlayClose
      spotlightPadding={14}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          zIndex: 10000,
          backgroundColor: "#ffffff",
          textColor: "#111827",
          primaryColor: "#2563EB",
          overlayColor: "rgba(0,0,0,0.85)",
          width: 360,
        },
        tooltip: {
          borderRadius: 16,
          padding: "20px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
        },
        spotlight: {
          borderRadius: 14,
        },
        buttonNext: {
          backgroundColor: "#2563EB",
          borderRadius: 8,
        },
        buttonBack: {
          marginRight: 8,
        },
      }}
      locale={{
        next: "Next",
        back: "Back",
        skip: "Skip Tour",
        last: "Finish",
      }}
    />
  );
}
