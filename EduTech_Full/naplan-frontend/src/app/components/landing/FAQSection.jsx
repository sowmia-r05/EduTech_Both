import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'

const FAQS = [
  {
    question: 'Is there a free trial?',
    answer: 'Yes! You can complete one full-length practice test free with instant scoring and feedback.'
  },
  {
    question: 'Who is this platform for?',
    answer: 'Designed for Year 3, 5, 7, and 9 students preparing for NAPLAN.'
  },
  {
    question: 'Do I get instant results?',
    answer: 'Yes, every test provides instant scoring and topic-wise breakdowns.'
  },
  {
    question: 'Is writing feedback included?',
    answer: 'Yes, AI-powered feedback is included for writing tasks.'
  }
]

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null)

  return (
    <section id="faq" className="py-24 bg-white scroll-mt-28">
      <div className="mx-auto max-w-4xl px-6 text-center">

        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12">
          Frequently Asked Questions
        </h2>

        <div className="space-y-4 text-left">
          {FAQS.map((faq, idx) => (
            <motion.div
              key={idx}
              onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
              className="border rounded-xl border-gray-200 p-5 cursor-pointer hover:shadow-sm transition"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-800">
                  {faq.question}
                </h3>
                <ChevronDown
                  className={`h-5 w-5 transition-transform ${
                    openIndex === idx ? 'rotate-180' : ''
                  }`}
                />
              </div>

              {openIndex === idx && (
                <p className="mt-3 text-gray-600">{faq.answer}</p>
              )}
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  )
}
