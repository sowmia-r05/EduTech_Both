import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function FreeTrialPage() {
  const navigate = useNavigate();

  const steps = [
    "Select your child’s Year Level (3, 5, 7, or 9).",
    "Complete a full-length NAPLAN-style practice test online.",
    "Receive instant scoring and detailed performance feedback.",
    "Identify strengths and areas for improvement with topic-wise insights.",
  ];

  const handleStartTest = () => {
    navigate("/start-test"); // 🔥 Updated route
  };

  return (
    <motion.section
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 text-gray-900 px-6"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="max-w-4xl w-full text-center">

        {/* Headline */}
        <h1 className="text-3xl md:text-5xl font-bold mb-6 text-indigo-600 leading-tight">
          Free NAPLAN-Style Practice Test for Your Child
        </h1>

        {/* Subheading */}
        <p className="text-lg text-gray-700 mb-4 max-w-2xl mx-auto">
          Give your child one full-length NAPLAN-style practice test and receive
          instant scoring with detailed performance insights.
        </p>

        {/* Authority Line */}
        <p className="text-sm text-gray-500 mb-12">
          Aligned with Australian Curriculum standards and designed specifically
          for NAPLAN preparation.
        </p>

        {/* Steps */}
        <div className="space-y-6 text-left mb-14 max-w-2xl mx-auto">
          {steps.map((step, idx) => (
            <motion.div
              key={idx}
              className="flex items-start gap-4"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-md">
                {idx + 1}
              </div>
              <p className="text-gray-800">{step}</p>
            </motion.div>
          ))}
        </div>

        {/* CTA Section */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">

          {/* Primary CTA */}
          <motion.button
            onClick={handleStartTest}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-16 py-5 rounded-2xl text-lg font-semibold shadow-lg hover:shadow-2xl transition"
          >
            Start My Child’s Free Test
          </motion.button>

          {/* Secondary Action */}
          <button
            onClick={() => navigate("/")}
            className="text-indigo-600 hover:text-indigo-800 transition font-semibold"
          >
            Learn How It Works
          </button>
        </div>

        {/* Reassurance */}
        <p className="text-sm text-gray-500 mt-8">
          ✅ No credit card required · ⏱ 45–60 mins · 📊 Instant detailed results · 🔒 Secure & private
        </p>

      </div>
    </motion.section>
  );
}
