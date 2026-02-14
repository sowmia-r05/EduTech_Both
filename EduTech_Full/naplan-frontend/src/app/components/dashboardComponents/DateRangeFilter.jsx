import React from "react";
import DatePicker from "react-datepicker";
import { XMarkIcon } from "@heroicons/react/24/outline";
import "react-datepicker/dist/react-datepicker.css";

export default function DateRangeFilter({
  selectedDate,
  onChange,
  testTakenDates = [],
}) {
  const testDatesSet = new Set(
    testTakenDates.map((d) => d.toDateString())
  );

  return (
    <div className="relative inline-block">
      <DatePicker
        selected={selectedDate}
        onChange={onChange}
        placeholderText="Select date"
        maxDate={new Date()} // disable future dates
        renderDayContents={(day, date) => {
          const isTestDate = testDatesSet.has(date.toDateString());

          return (
            <div className="relative flex justify-center items-center w-full h-full">
              {day}
              {isTestDate && (
                <span className="absolute -bottom-1 w-1.5 h-1.5 bg-purple-600 rounded-full"></span>
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

      {/* ✅ Clear Button */}
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
  );
}
