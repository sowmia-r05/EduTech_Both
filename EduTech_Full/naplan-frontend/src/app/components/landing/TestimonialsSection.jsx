import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

export default function TestimonialsSection() {
  const testimonials = [
    'My daughter felt significantly more confident before her exam.',
    'The instant feedback helped us focus exactly where needed.',
    'Clear structure, simple to use, and very effective.'
  ]

  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % testimonials.length), 4000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className="py-36 bg-white text-center">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-20">What Parents Are Saying</h2>

        <motion.div
          className="bg-slate-50 p-16 rounded-3xl shadow-sm min-h-[150px] flex items-center justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-xl text-gray-700 italic leading-relaxed"
          >
            “{testimonials[index]}”
          </motion.p>
        </motion.div>
      </div>
    </section>
  )
}
