import React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function DateRangeFilter({ selectedDate, onChange, testTakenDates }) {
  // Convert testTakenDates to a set of strings for easy lookup
  const testDatesSet = new Set(
    testTakenDates.map((d) => d.toDateString())
  );

  return (
    <DatePicker
      selected={selectedDate}
      onChange={onChange}
      placeholderText="Select date"
      maxDate={new Date()} // disable future dates
      dayClassName={(date) => {
        const isTestDate = testDatesSet.has(date.toDateString());
        return isTestDate ? "relative" : undefined;
      }}
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
      className="border border-purple-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400"
    />
  );
}
