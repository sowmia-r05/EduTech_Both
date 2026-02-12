import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'

const FAQS = [
  { question: 'Who is this platform for?', answer: 'Our NAPLAN mock exams are designed for Year 3, 5, 7, and 9 students, helping them prepare effectively.' },
  { question: 'Do I get instant results?', answer: 'Yes! Every test gives instant scoring and a topic-wise breakdown of strengths and weaknesses.' },
  { question: 'Can my child practice at home?', answer: 'Absolutely! Our platform is fully online and can be accessed anytime from home.' },
  { question: 'Is writing feedback included?', answer: 'Yes, AI-powered feedback is provided for writing tasks to help your child improve.' }
]

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null)
  const toggle = (index) => setOpenIndex(openIndex === index ? null : index)

  return (
    <section id="faq" className="py-36 bg-white">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12">Frequently Asked Questions</h2>

        <div className="space-y-4 text-left">
          {FAQS.map((faq, idx) => (
            <motion.div
              key={idx}
              onClick={() => toggle(idx)}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
              className="border rounded-xl border-gray-200 p-5 cursor-pointer transition hover:shadow-sm"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-800">{faq.question}</h3>
                <ChevronDown className={`h-5 w-5 text-gray-600 transition-transform ${openIndex === idx ? 'rotate-180' : ''}`} />
              </div>
              {openIndex === idx && <p className="mt-3 text-gray-600">{faq.answer}</p>}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
