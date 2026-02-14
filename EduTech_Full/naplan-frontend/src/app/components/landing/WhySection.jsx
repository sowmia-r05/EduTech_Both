import { motion } from "framer-motion"
import { CheckCircle } from "lucide-react"

const FEATURES = [
  "Authentic NAPLAN-style questions",
  "Instant scoring & topic breakdown",
  "AI-powered writing feedback",
  "Track progress over time",
  "Accessible anytime, anywhere",
  "Built for Years 3, 5, 7 & 9"
]

export default function WhySection() {
  return (
    <section id="why" className="py-24 bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 text-center">

        <h2 className="text-4xl font-bold mb-14">
          Why Families Choose Us
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          {FEATURES.map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition"
            >
              <CheckCircle className="h-8 w-8 text-indigo-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold">{item}</h3>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  )
}
