import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'


export default function HeroSection() {
  const navigate = useNavigate()

  const scrollToHowItWorks = () => {
    const el = document.getElementById('how')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <motion.section
      id="home"
      className="relative py-28 md:py-32 bg-gradient-to-b from-white to-indigo-50 overflow-hidden"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="mx-auto max-w-6xl px-6 text-center">

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1]">
          NAPLAN Preparation
          <span className="block text-indigo-600">Done the Right Way</span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-gray-600 leading-relaxed max-w-3xl mx-auto">
          Full-length NAPLAN-style practice tests, instant scoring,
          and clear performance insights — built to boost confidence and maximise results.
        </p>

        <div className="mt-10 flex justify-center gap-4 flex-wrap">
          <button
            onClick={() => navigate('/free-trial')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-4 rounded-xl text-lg font-semibold transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
          >
            Start Free Trial
          </button>

          <button
            onClick={scrollToHowItWorks}
            className="border border-indigo-600 text-indigo-600 px-10 py-4 rounded-xl text-lg font-semibold hover:bg-indigo-50 transition"
          >
            See How It Works
          </button>
        </div>

        <p className="mt-5 text-sm text-gray-500">
          No credit card required • Instant access • One full test free
        </p>

        <p className="mt-5 text-sm text-gray-500 max-w-md mx-auto">
          This product is an independent practice resource aligned to the Australian Curriculum. 
          It is not affiliated with, endorsed by, or associated with ACARA or NAPLAN.
        </p>

      </div>
    </motion.section>
  )
}
