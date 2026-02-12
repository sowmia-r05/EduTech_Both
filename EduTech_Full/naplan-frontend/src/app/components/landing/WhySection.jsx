import { motion } from "framer-motion"
import { CheckCircle } from "lucide-react"

const FEATURES = [
  { title: "Authentic NAPLAN-style questions" },
  { title: "Instant scoring & topic breakdown" },
  { title: "AI-powered writing feedback" },
  { title: "Track progress over time" },
  { title: "Accessible anytime, anywhere" },
  { title: "Built for Years 3, 5, 7 & 9" }
]

export default function WhySection() {
  return (
    <section id="why" className="py-28 bg-gray-50 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-6 text-center">
        <h2 className="text-4xl font-bold mb-16">
          Why Families Choose Us
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          {FEATURES.map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition"
            >
              <CheckCircle className="h-8 w-8 text-indigo-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold">
                {item.title}
              </h3>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
