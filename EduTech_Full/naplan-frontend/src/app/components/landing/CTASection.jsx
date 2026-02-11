import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function CTASection() {
  const navigate = useNavigate()

  return (
    <motion.section
      className="py-36 bg-indigo-600 text-white text-center"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      viewport={{ once: true }}
    >
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-8">
          Ready to Give Your Child a Confident Start?
        </h2>
        <p className="text-lg opacity-90 mb-12">
          Structured preparation, instant feedback, and measurable improvement—all in one platform.
        </p>
        <button
          onClick={() => navigate('/register')}
          className="bg-white text-indigo-700 px-14 py-5 rounded-xl text-lg font-semibold hover:bg-gray-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
        >
          Get Instant Access
        </button>
      </div>
    </motion.section>
  )
}
