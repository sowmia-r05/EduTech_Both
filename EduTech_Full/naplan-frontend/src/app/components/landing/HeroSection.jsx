import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function HeroSection() {
  const navigate = useNavigate()
  const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } }
  }

  return (
    <motion.section
      id="home"
      className="relative py-36 bg-gradient-to-b from-white to-indigo-50 overflow-hidden"
      initial="hidden"
      animate="show"
      variants={fadeUp}
    >
      <div className="mx-auto max-w-7xl px-6 text-center">

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1]">
          NAPLAN Preparation
          <span className="block text-indigo-600">Done the Right Way</span>
        </h1>

        <p className="mt-8 text-xl text-gray-600 leading-relaxed max-w-3xl mx-auto">
          Full-length NAPLAN-style practice tests, instant scoring,
          and clear performance insights — built to boost confidence and maximise results.
        </p>

        <div className="mt-12 flex justify-center gap-6 flex-wrap">
          <button
            onClick={() => navigate('/register')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-12 py-4 rounded-xl text-lg font-semibold transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
          >
            Get Instant Access
          </button>

          <button
            onClick={() => navigate('/samples')}
            className="border border-indigo-600 text-indigo-600 px-12 py-4 rounded-xl text-lg font-semibold hover:bg-indigo-50 transition-all duration-300"
          >
            View Sample Questions
          </button>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          Secure checkout • One-time payment • Instant access
        </p>

      </div>
    </motion.section>
  )
}
