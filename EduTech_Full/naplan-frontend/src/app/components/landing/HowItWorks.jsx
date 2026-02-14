import { motion } from 'framer-motion'

export default function HowItWorks() {
  const steps = [
    'Create Your Free Account',
    'Complete a Full-Length Practice Test',
    'Receive Instant Detailed Reports',
    'Follow a Clear Improvement Plan'
  ]

  return (
    <section className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6 text-center">

        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-16">
          How It Works
        </h2>

        <motion.div
          className="grid md:grid-cols-4 gap-10"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={{ show: { transition: { staggerChildren: 0.15 } } }}
        >
          {steps.map((step, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, y: 40 },
                show: { opacity: 1, y: 0 }
              }}
              className="space-y-4"
            >
              <div className="h-14 w-14 mx-auto flex items-center justify-center rounded-full bg-indigo-600 text-white font-bold text-xl">
                {i + 1}
              </div>
              <p className="font-semibold text-gray-900">{step}</p>
            </motion.div>
          ))}
        </motion.div>

      </div>
    </section>
  )
}
