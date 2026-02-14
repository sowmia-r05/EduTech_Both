import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function CTASection() {
  const navigate = useNavigate()

  return (
    <motion.section
      className="py-28 bg-indigo-600 text-white text-center"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <div className="max-w-3xl mx-auto px-6">

        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
          Ready to Give Your Child a Confident Start?
        </h2>

        <p className="text-lg opacity-90 mb-10">
          Start with one full-length practice test free — no credit card required.
        </p>

        <button
          onClick={() => navigate('/free-trial')}
          className="bg-white text-indigo-700 px-12 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition hover:-translate-y-1 hover:shadow-xl"
        >
          Start Free Trial
        </button>

      </div>
    </motion.section>
  )
}
