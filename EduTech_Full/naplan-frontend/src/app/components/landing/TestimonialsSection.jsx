import { motion } from 'framer-motion'

const testimonials = [
  {
    quote: "The instant feedback helped us focus exactly where needed.",
    name: "Sarah M.",
    meta: "Parent of Year 5 student"
  },
  {
    quote: "Clear structure, simple to use, and very effective.",
    name: "Daniel K.",
    meta: "Parent of Year 7 student"
  }
]

export default function TestimonialsSection() {
  return (
    <section className="py-24 bg-white text-center">
      <div className="max-w-3xl mx-auto px-6">

        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-16">
          What Parents Are Saying
        </h2>

        <motion.div
          className="bg-slate-50 p-12 rounded-3xl shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-xl text-gray-700 italic leading-relaxed mb-6">
            “{testimonials[0].quote}”
          </p>
          <p className="font-semibold text-gray-900">
            {testimonials[0].name}
          </p>
          <p className="text-sm text-gray-500">
            {testimonials[0].meta}
          </p>
        </motion.div>

      </div>
    </section>
  )
}
