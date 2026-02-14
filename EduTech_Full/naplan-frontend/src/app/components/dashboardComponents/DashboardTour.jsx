import { useEffect, useState } from "react";
import Joyride, { STATUS, EVENTS } from "react-joyride";

/* ---------- Storage Key ---------- */
const TOUR_STORAGE_KEY = "dashboardTourCompleted";

/* ---------- Glow Presets ---------- */

const createGlow = (color, soft, strong = false) => ({
  "--glow-color": color,
  "--glow-soft": soft,
  animation: `spotlightBreathing ${strong ? "1s" : "1.6s"} ease-in-out infinite`,
  borderRadius: 14,
  transform: strong ? "scale(1.03)" : "none",
});

/* ---------- Color Variants ---------- */

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

/* ---------- Tour Steps ---------- */

const tourSteps = [
  {
    target: "#overall-score",
    content: "This is your overall score.",
    styles: { spotlight: glowBlueStrong },
  },
  {
    target: "#time-spent",
    content: "Here you see the time spent on the quiz.",
    styles: { spotlight: glowGreen },
  },
  {
    target: "#ai-coach",
    content: "AI Coach panel with feedback.",
    styles: { spotlight: glowPurple },
  },
  {
    target: "#donut-chart",
    content: "Donut chart showing score breakdown.",
    styles: { spotlight: glowBlue },
  },
  {
    target: "#weak-topics",
    content: "Topics you need to improve on.",
    styles: { spotlight: glowGreen },
  },
  {
    target: "#top-topics",
    content: "Your strongest topics.",
    styles: { spotlight: glowPurple },
  },
  {
    target: "#suggestions",
    content: "AI study suggestions.",
    styles: { spotlight: glowBlue },
  },
];

export default function DashboardTour({ isTourActive, setIsTourActive }) {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  /* ---------- Start Tour Only If Not Completed Before ---------- */
  useEffect(() => {
    const hasCompletedTour = localStorage.getItem(TOUR_STORAGE_KEY);

    if (isTourActive && !hasCompletedTour) {
      setRun(true);
      setStepIndex(0);
    }
  }, [isTourActive]);

  /* ---------- Joyride Callback ---------- */
  const handleJoyrideCallback = (data) => {
    const { status, type, index } = data;

    if (type === EVENTS.STEP_AFTER) {
      setStepIndex(index + 1);
    }

    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      // ✅ Mark tour as completed permanently
      localStorage.setItem(TOUR_STORAGE_KEY, "true");

      setRun(false);
      setIsTourActive(false);
      setStepIndex(0);
    }
  };

  return (
    <Joyride
      steps={tourSteps}
      run={run}
      stepIndex={stepIndex}
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
          width: 340,
        },
        tooltip: {
          borderRadius: 14,
          padding: "18px",
        },
        spotlight: {
          borderRadius: 14,
        },
        buttonNext: {
          backgroundColor: "#2563EB",
        },
        buttonBack: {
          marginRight: 8,
        },
      }}
      locale={{
        next: "Next",
        back: "Previous",
        skip: "Skip",
        last: "Finish",
      }}
    />
  );
}
