import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';

import heroImg from '@/app/Images/new-years-resolutions.svg';
import whyImg from '@/app/Images/painting-the-room.svg';

const INFO_CARDS = [
  {
    title: 'What you get',
    text:
      'Instant scores, topic-wise insights, and AI-powered feedback — including Writing support.',
  },
  {
    title: 'How it works',
    text:
      'Register → complete your grade’s FlexiQuiz test → return here to view your detailed dashboard.',
  },
];

const FEATURES = [
  'NAPLAN-style exam experience',
  'Timed practice to build speed and confidence',
  'Instant results after finishing',
  'Topic-wise breakdown of strengths and weak areas',
  'Smart feedback to learn from mistakes (especially Writing)',
  'Practice anytime, from home',
];

export default function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-50 via-blue-50 to-indigo-100">
      {/* Single calm decorative element */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full bg-indigo-300/30 blur-3xl" />

      <main className="relative mx-auto max-w-7xl px-4 py-16">

        {/* ================= HERO ================= */}
        <section className="mb-28 grid items-center gap-12 md:grid-cols-[60%_40%]">
          {/* LEFT */}
          <div className="max-w-2xl animate-fade-in-up">
            <h1 className="mb-6 text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900">
              NAPLAN Mock Exam
            </h1>

            <p className="mb-6 text-lg md:text-xl leading-relaxed text-gray-700">
              Practice smarter. Build confidence. Prepare for NAPLAN with a
              realistic exam-style experience in{' '}
              <span className="font-semibold">Numeracy</span>,{' '}
              <span className="font-semibold">Reading</span>,{' '}
              <span className="font-semibold">Writing</span>, and{' '}
              <span className="font-semibold">Language Conventions</span>.
            </p>

            <p className="mb-10 text-gray-600">
              Designed for <strong>Year 3</strong>, <strong>Year 5</strong>,{' '}
              <strong>Year 7</strong>, and <strong>Year 9</strong>.
            </p>

            {/* Info cards */}
            <div className="mb-12 space-y-4">
              {INFO_CARDS.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-gray-200 bg-white/80 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <p className="text-gray-700">
                    <span className="font-semibold">{item.title}:</span>{' '}
                    {item.text}
                  </p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <Button
              size="lg"
              onClick={() => navigate('/register')}
              className="group rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-12 py-7 text-lg shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:from-indigo-700 hover:to-indigo-800"
            >
              Start Free Practice
              <ArrowRight className="ml-3 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
          </div>

          {/* RIGHT */}
          <div className="flex justify-end animate-fade-in">
            <ImageWithFallback
              src={heroImg}
              alt="Student preparing for an exam"
              className="w-full max-w-lg translate-x-6 drop-shadow-lg"
            />
          </div>
        </section>

        {/* ================= WHY SECTION ================= */}
        <section className="animate-fade-in-up">
          <Card className="rounded-3xl shadow-xl">
            <CardContent className="p-8 md:p-14">
              <div className="grid items-center gap-14 md:grid-cols-3">

                {/* FEATURES */}
                <div className="md:col-span-2">
                  <h2 className="mb-10 text-2xl md:text-3xl font-bold text-gray-900">
                    Why use this mock exam?
                  </h2>

                  <div className="grid gap-6 sm:grid-cols-2">
                    {FEATURES.map((feature) => (
                      <div
                        key={feature}
                        className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                      >
                        <CheckCircle2 className="mt-1 h-6 w-6 flex-shrink-0 text-green-600 transition-transform duration-300 group-hover:scale-110" />
                        <p className="text-lg text-gray-700">{feature}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ILLUSTRATION */}
                <div className="hidden md:flex justify-center">
                  <ImageWithFallback
                    src={whyImg}
                    alt="Improving academic skills"
                    className="w-full max-w-sm drop-shadow-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

      </main>
    </div>
  );
}