import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import { XMarkIcon } from "@heroicons/react/24/outline";
import "react-datepicker/dist/react-datepicker.css";

/* ═══════════════════════ HELPERS ═══════════════════════ */
const unwrapDate = (d) =>
  d && typeof d === "object" && "$date" in d ? d.$date : d;

const toDateKey = (d) => {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt.toDateString();
};

const formatTime = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/* ─── Writing-specific: extract the best date field from a writing doc ─── */
const getWritingDate = (w) =>
  unwrapDate(w?.submitted_at || w?.date_submitted || w?.date_created || w?.createdAt);

/* ═══════════════════════ WRITING ATTEMPT PICKER MODAL ═══════════════════════ */
function WritingAttemptPickerModal({ isOpen, onClose, attempts, onSelect, dateLabel }) {
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !attempts?.length) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Multiple Writing Attempts
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
            const raw = getWritingDate(attempt);
            const time = raw ? formatTime(raw) : "—";

            // ✅ Writing-specific: show band + total score instead of generic percentage
            const feedback = attempt?.ai?.feedback;
            const totalScore = feedback?.overall?.total_score;
            const maxScore = feedback?.overall?.max_score;
            const band = feedback?.overall?.band;
            const wordCount = feedback?.meta?.word_count ?? feedback?.word_count;
            const quizName = attempt?.quiz_name || "Writing";

            // Score display — prefer "12/55" style for writing
            const scoreDisplay =
              totalScore != null && maxScore != null
                ? `${totalScore}/${maxScore}`
                : "—";

            // Band-based status label (matches NonWriting style)
            const statusLabel = band?.includes("Above")
              ? "Above Standard"
              : band?.includes("Below")
                ? "Below Standard"
                : band
                  ? "At Standard"
                  : "—";

            return (
              <button
                key={attempt._id || attempt.response_id || idx}
                onClick={() => onSelect(attempt, idx)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition group text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    Attempt {idx + 1} — {quizName}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {time} • Score: {scoreDisplay} • {statusLabel}
                    {wordCount != null && ` • ${wordCount} words`}
                  </p>
                </div>

                <svg
                  className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 mt-3 text-center">
          Select an attempt to view its detailed feedback
        </p>
      </div>
    </div>,
    document.body
  );
}

/* ═══════════════════════ DATE RANGE WRITING FILTER ═══════════════════════ */
export default function DateRangeWritingFilter({
  selectedDate,
  onChange,
  testTakenDates = [],
  quizAttempts = [],
  onAttemptSelect = null,
}) {
  const datePickerRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState(null);
  const [pendingAttempts, setPendingAttempts] = useState([]);

  /* ─── dateCountMap: count of attempts per calendar day ─── */
  const dateCountMap = useMemo(() => {
    const map = {};
    testTakenDates.forEach((d) => {
      const key = d.toDateString();
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [testTakenDates]);

  /* ─── dateAttemptsMap: dedup by response_id + attempt, group by day ─── */
  const dateAttemptsMap = useMemo(() => {
    const map = {};
    const seen = new Set();

    quizAttempts.forEach((a) => {
      const respId = a?.response_id || a?.responseId || "";
      const attempt = a?.attempt ?? "";
      const uid = `${respId}__${attempt}`;
      if (seen.has(uid)) return;
      seen.add(uid);

      const raw = getWritingDate(a);
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
        const da = new Date(getWritingDate(a) || 0);
        const db = new Date(getWritingDate(b) || 0);
        return da - db;
      })
    );
    return map;
  }, [quizAttempts]);

  /* ─── Handlers ─── */
  const handleDateChange = (date) => {
    if (!date) {
      onChange(null);
      return;
    }
    const key = toDateKey(date);
    const attemptsForDay = dateAttemptsMap[key] || [];

    if (attemptsForDay.length > 1 && onAttemptSelect) {
      // Close the DatePicker calendar FIRST, then show modal after delay
      if (datePickerRef.current) {
        datePickerRef.current.setOpen(false);
      }
      setPendingDate(date);
      setPendingAttempts(attemptsForDay);
      setTimeout(() => setPickerOpen(true), 150);
    } else {
      onChange(date);
    }
  };

  const handleAttemptPick = (attempt, index) => {
    setPickerOpen(false);
    onChange(pendingDate);
    if (onAttemptSelect) onAttemptSelect(attempt, index);
    setPendingDate(null);
    setPendingAttempts([]);
  };

  const handlePickerClose = () => {
    setPickerOpen(false);
    if (pendingDate) onChange(pendingDate);
    setPendingDate(null);
    setPendingAttempts([]);
  };

  const dateLabel = pendingDate
    ? pendingDate.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <>
      <div className="relative inline-block">
        <DatePicker
          ref={datePickerRef}
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
                        count === 1 ? "bg-teal-500" : "bg-orange-500"
                      }`}
                    />
                  </span>
                )}
              </div>
            );
          }}
          className="w-56 border border-purple-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        {selectedDate && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-purple-600 hover:bg-purple-600 hover:text-white transition"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Modal renders via portal to document.body — completely outside header DOM */}
      <WritingAttemptPickerModal
        isOpen={pickerOpen}
        onClose={handlePickerClose}
        attempts={pendingAttempts}
        onSelect={handleAttemptPick}
        dateLabel={dateLabel}
      />
    </>
  );
}
