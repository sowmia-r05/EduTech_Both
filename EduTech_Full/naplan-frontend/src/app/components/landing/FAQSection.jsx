// src/app/components/landing/FAQSection.jsx
import { ChevronDown, BookOpen } from 'lucide-react'

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
    answer: 'Yes — writing tasks are marked by AI (Google Gemini), not a human teacher. See our full parent guide for details.'
  }
]

export default function FAQSection() {
  return (
    <section id="faq" className="py-24 bg-white scroll-mt-28">
      <div className="mx-auto max-w-4xl px-6 text-center">

        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12">
          Frequently Asked Questions
        </h2>

        <div className="space-y-4 text-left">
          {FAQS.map((faq, idx) => (
            <details
              key={idx}
              className="group border rounded-xl border-gray-200 p-5 cursor-pointer hover:shadow-sm transition"
            >
              <summary className="flex justify-between items-center marker:content-['']">
                <h3 className="text-lg font-semibold text-gray-800">
                  {faq.question}
                </h3>
                <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-gray-600">{faq.answer}</p>
            </details>
          ))}
        </div>

        {/* ── CTA: guide visitors to the full parent guide (/help) ── */}
        <div className="mt-12 rounded-2xl border border-indigo-100 bg-indigo-50 px-6 py-8">
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
              <BookOpen className="h-6 w-6 text-indigo-600" />
            </span>
            <h3 className="text-xl font-bold text-gray-900">New here? Read the Parent Guide</h3>
            <p className="max-w-md text-sm text-gray-600">
              A step-by-step walkthrough — from creating your account to reading your
              child&apos;s first results — plus answers to every common question.
            </p>
            <a
              href="#/help"
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700"
            >
              Open Parent Guide &amp; FAQ →
            </a>
          </div>
        </div>

      </div>
    </section>
  )
}