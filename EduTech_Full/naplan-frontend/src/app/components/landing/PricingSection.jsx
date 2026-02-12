import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function PricingSection() {
  const navigate = useNavigate()

  return (
    <section className="py-36 bg-white">
      <div className="max-w-4xl mx-auto px-6 text-center">

        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-20">Simple, Transparent Pricing</h2>

        <motion.div
          className="relative bg-slate-50 p-16 rounded-3xl shadow-xl"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-5 py-1 text-sm rounded-full">
            Most Popular
          </div>

          <p className="text-5xl font-extrabold text-indigo-600 mb-6 mt-6">$XX</p>
          <p className="text-gray-600 mb-10">One-time payment • Full access • No recurring charges</p>

          <button
            onClick={() => navigate('/register')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-12 py-4 rounded-xl text-lg font-semibold transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
          >
            Enroll Now
          </button>
        </motion.div>

      </div>
    </section>
  )
}
