import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function StartTestPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [betaMessage, setBetaMessage] = useState("");

  const handleContinue = () => {
    if (!name.trim()) {
      setBetaMessage("Please enter your child’s name.");
      return;
    }

    if (!year) {
      setBetaMessage("Please select your child’s year level.");
      return;
    }

    // Only Year 3 is live
    if (year !== "3") {
      setBetaMessage("🚧 This year level is currently in Beta. Coming soon!");
      return;
    }

    // Clear any previous message
    setBetaMessage("");

    // Store info for personalization
    localStorage.setItem("childName", name);
    localStorage.setItem("yearLevel", year);

    navigate("/trial-test");
  };

  const handleYearChange = (value) => {
    setYear(value);

    // Clear beta message if Year 3 selected
    if (value === "3") {
      setBetaMessage("");
    }
  };

  return (
    <motion.section
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="bg-white shadow-2xl rounded-3xl p-10 w-full max-w-lg">

        <h2 className="text-3xl font-bold text-indigo-600 mb-6 text-center">
          Start Your Free NAPLAN-Style Test
        </h2>

        <p className="text-gray-600 text-center mb-8">
          Enter a few details to personalise the experience.
        </p>

        {/* Name Field */}
        <div className="mb-6">
          <label className="block text-gray-700 font-medium mb-2">
            Student Name
          </label>
          <input
            type="text"
            placeholder="Enter name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setBetaMessage("");
            }}
            className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        {/* Year Dropdown */}
        <div className="mb-4">
          <label className="block text-gray-700 font-medium mb-2">
            Select Year Level
          </label>
          <select
            value={year}
            onChange={(e) => handleYearChange(e.target.value)}
            className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">Choose Year</option>
            <option value="3">Year 3</option>
            <option value="5">Year 5 (Beta)</option>
            <option value="7">Year 7 (Beta)</option>
            <option value="9">Year 9 (Beta)</option>
          </select>
        </div>

        {/* Message Display */}
        {betaMessage && (
          <p className="text-orange-600 text-sm mb-6 font-medium text-center">
            {betaMessage}
          </p>
        )}

        {/* Continue Button */}
        <motion.button
          onClick={handleContinue}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-semibold text-lg shadow-lg transition"
        >
          Start Test
        </motion.button>

      </div>
    </motion.section>
  );
}