import React, { useState, useEffect, useMemo } from "react";
import DatePicker from "react-datepicker";
import { XMarkIcon } from "@heroicons/react/24/outline";
import "react-datepicker/dist/react-datepicker.css";

/* ─── Helper: unwrap MongoDB $date wrapper ─── */
const unwrapDate = (d) =>
  d && typeof d === "object" && "$date" in d ? d.$date : d;

/* ─── Helper: normalise date key ─── */
const toDateKey = (d) => {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt.toDateString();
};

/* ─── Format time for display ─── */
const formatTime = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/* ═══════════════════════════════════════════════════════════
   ATTEMPT PICKER MODAL
   Shows when user clicks a date with multiple attempts.
   ═══════════════════════════════════════════════════════════ */
function AttemptPickerModal({ isOpen, onClose, attempts, onSelect, dateLabel }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !attempts?.length) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Multiple Attempts Found
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">{dateLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 transition"
          >
            <XMarkIcon className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Attempt list */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {attempts.map((attempt, idx) => {
            const raw = unwrapDate(
              attempt?.createdAt || attempt?.date_submitted || attempt?.submitted_at
            );
            const time = raw ? formatTime(raw) : "—";
            const score = attempt?.score?.percentage != null
              ? `${Math.round(Number(attempt.score.percentage))}%`
              : "—";
            const grade = attempt?.score?.grade || "";
            const quizName = attempt?.quiz_name || "Quiz";

            return (
              <button
                key={attempt._id || attempt.response_id || idx}
                onClick={() => onSelect(attempt, idx)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200
                           hover:border-purple-300 hover:bg-purple-50/50 transition group text-left"
              >
                {/* Attempt info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    Attempt {idx + 1} — {quizName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {time} • Score: {score} {grade && `• ${grade}`}
                  </p>
                </div>

                {/* Arrow */}
                <svg
                  className="w-4 h-4 text-gray-300 group-hover:text-purple-500 transition flex-shrink-0"
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <p className="text-xs text-gray-400 mt-3 text-center">
          Select an attempt to view its detailed report
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ENHANCED DATE RANGE FILTER

   Two-colour system:
     • Purple dot  → 1 attempt on that day
     • Blue dot    → 2+ attempts on that day (opens picker modal)
   ═══════════════════════════════════════════════════════════ */
export default function DateRangeFilter({
  selectedDate,
  onChange,
  testTakenDates = [],
  quizAttempts = [],       // NEW: full attempt objects for picker
  onAttemptSelect = null,  // NEW: callback(attempt, index) when user picks from modal
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState(null);
  const [pendingAttempts, setPendingAttempts] = useState([]);

  /* ─── Build a map: dateString → count of attempts ─── */
  const dateCountMap = useMemo(() => {
    const map = {};
    testTakenDates.forEach((d) => {
      const key = d.toDateString();
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [testTakenDates]);

  /* ─── Build a map: dateString → array of attempt objects ─── */
  const dateAttemptsMap = useMemo(() => {
    const map = {};
    quizAttempts.forEach((a) => {
      const raw = unwrapDate(a?.createdAt || a?.date_submitted || a?.submitted_at);
      if (!raw) return;
      const dt = new Date(raw);
      if (isNaN(dt.getTime())) return;
      const key = toDateKey(dt);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    // Sort each day's attempts chronologically
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => {
        const da = new Date(unwrapDate(a?.createdAt || a?.date_submitted || a?.submitted_at) || 0);
        const db = new Date(unwrapDate(b?.createdAt || b?.date_submitted || b?.submitted_at) || 0);
        return da - db;
      })
    );
    return map;
  }, [quizAttempts]);

  /* ─── Handle date selection from DatePicker ─── */
  const handleDateChange = (date) => {
    if (!date) {
      onChange(null);
      return;
    }

    const key = toDateKey(date);
    const attemptsForDay = dateAttemptsMap[key] || [];

    if (attemptsForDay.length > 1 && onAttemptSelect) {
      // Multiple attempts → show picker modal
      setPendingDate(date);
      setPendingAttempts(attemptsForDay);
      setPickerOpen(true);
    } else {
      // 0 or 1 attempt → normal behaviour (unchanged)
      onChange(date);
    }
  };

  /* ─── Handle attempt selection from modal ─── */
  const handleAttemptPick = (attempt, index) => {
    setPickerOpen(false);
    onChange(pendingDate);
    if (onAttemptSelect) onAttemptSelect(attempt, index);
    setPendingDate(null);
    setPendingAttempts([]);
  };

  const handlePickerClose = () => {
    setPickerOpen(false);
    // Still set the date even if they dismiss — show latest attempt (existing behaviour)
    if (pendingDate) onChange(pendingDate);
    setPendingDate(null);
    setPendingAttempts([]);
  };

  /* ─── Date label for the modal ─── */
  const dateLabel = pendingDate
    ? pendingDate.toLocaleDateString(undefined, {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      })
    : "";

  return (
    <>
      <div className="relative inline-block">
        <DatePicker
          selected={selectedDate}
          onChange={handleDateChange}
          placeholderText="Select date"
          maxDate={new Date()}
          renderDayContents={(day, date) => {
            const key = date.toDateString();
            const count = dateCountMap[key] || 0;

            return (
              <div className="relative flex justify-center items-center w-full h-full">
                {day}
                {count > 0 && (
                  <span className="absolute -bottom-1 flex justify-center">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        count === 1 ? "bg-purple-600" : "bg-blue-500"
                      }`}
                    />
                  </span>
                )}
              </div>
            );
          }}
          className="
            w-56
            border border-purple-300
            rounded-lg
            px-3 py-2 pr-10
            focus:outline-none
            focus:ring-2 focus:ring-purple-400
          "
        />

        {/* ✅ Clear Button (unchanged) */}
        {selectedDate && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="
              absolute right-2 top-1/2 -translate-y-1/2
              p-1 rounded-full
              text-purple-600
              hover:bg-purple-600 hover:text-white
              transition
            "
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Attempt picker modal */}
      <AttemptPickerModal
        isOpen={pickerOpen}
        onClose={handlePickerClose}
        attempts={pendingAttempts}
        onSelect={handleAttemptPick}
        dateLabel={dateLabel}
      />
    </>
  );
}
