import { useState } from "react";
import DatePicker from "react-datepicker";
import { XMarkIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import "react-datepicker/dist/react-datepicker.css";

export default function DateRangeFilter({
  startDate,
  endDate,
  onChange,
}) {
  const [preset, setPreset] = useState("all");

  const handlePresetChange = (value) => {
    setPreset(value);

    if (value === "all") {
      onChange(null, null);
      return;
    }

    const now = new Date();
    const past = new Date();
    past.setDate(now.getDate() - Number(value));

    onChange(past, now);
  };

  return (
    <div className="flex items-center gap-3">
      
      {/* Preset Dropdown */}
      <div className="relative">
        <select
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="
            appearance-none
            bg-white
            pl-4 pr-10 py-2
            rounded-xl
            shadow-sm
            text-sm
            border border-gray-200
            hover:border-purple-400
            focus:outline-none
            focus:ring-2
            focus:ring-purple-300
            transition
          "
        >
          <option value="all">All Time</option>
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
        </select>

        {/* Custom Arrow */}
        <ChevronDownIcon className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-purple-500 pointer-events-none" />
      </div>

      {/* Date Range Picker */}
      <div className="relative bg-white px-6 py-2 rounded-xl shadow-sm border border-gray-200 hover:border-purple-400 focus-within:ring-2 focus-within:ring-purple-300 transition">
        
        <DatePicker
          selected={startDate}
          onChange={(dates) => {
            const [start, end] = dates;
            onChange(start, end);
          }}
          startDate={startDate}
          endDate={endDate}
          selectsRange
          placeholderText="Select date range"
          className="text-sm outline-none bg-transparent pr-10 w-56"
        />

        {/* Custom Clear Button */}
        {(startDate || endDate) && (
          <button
            onClick={() => onChange(null, null)}
            className="
              absolute right-2 top-1/2 -translate-y-1/2
              p-1.5 rounded-full
              text-purple-600
              hover:text-white
              hover:bg-purple-600
              transition
            "
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
