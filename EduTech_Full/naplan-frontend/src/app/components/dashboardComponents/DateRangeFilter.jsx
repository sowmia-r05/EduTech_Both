import DatePicker from "react-datepicker";
import { XMarkIcon } from "@heroicons/react/24/outline";
import "react-datepicker/dist/react-datepicker.css";

export default function DateFilter({
  selectedDate,
  onChange,
}) {
  return (
    <div className="flex items-center gap-3">
      
      <div className="relative bg-white px-6 py-2 rounded-xl shadow-sm border border-gray-200 hover:border-purple-400 focus-within:ring-2 focus-within:ring-purple-300 transition">
        
        <DatePicker
          selected={selectedDate}
          onChange={(date) => onChange(date)}
          placeholderText="Select date"
          className="text-sm outline-none bg-transparent pr-10 w-56"
          dateFormat="dd/MM/yyyy"
        />

        {/* Clear Button */}
        {selectedDate && (
          <button
            onClick={() => onChange(null)}
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
