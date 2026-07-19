// src/app/components/pages/ParentGuideFAQ.jsx
//
// Parent onboarding guide + FAQ as a standalone page (route: /help).
// Dependency-light (React + react-router Link) so it can't break the build.
//
// BEFORE PUBLISHING: replace the remaining yellow [FILL IN ...] highlights, and
// confirm your GEMINI_API_KEY project is billing-enabled (the AI answer says
// Google doesn't train on your child's work — only true on the paid API).

import { Link } from "react-router-dom";

// Highlights any still-unfilled blanks so they're obvious in the UI.
function Fill({ children }) {
  return (
    <span className="rounded bg-yellow-100 px-1 text-yellow-800">
      [FILL IN: {children}]
    </span>
  );
}

function Faq({ q, children }) {
  return (
    <details className="group border-b border-slate-200 py-3">
      <summary className="flex cursor-pointer items-center justify-between font-medium text-slate-800 marker:content-['']">
        <span>{q}</span>
        <span className="ml-4 text-slate-400 transition group-open:rotate-45">+</span>
      </summary>
      <div className="mt-2 text-sm leading-relaxed text-slate-600">{children}</div>
    </details>
  );
}

export default function ParentGuideFAQ() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-10 md:px-8">
      <div className="mx-auto max-w-3xl">

        {/* Back to home */}
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <span aria-hidden>&#8592;</span> Back to home
        </Link>

        <div className="rounded-2xl bg-white p-6 shadow-lg md:p-10">
          <h1 className="text-3xl font-bold text-indigo-600">Parent Guide &amp; FAQ</h1>
          <p className="mt-2 text-slate-600">
            Everything from creating your account to reading your child&apos;s first
            results, plus answers to the questions parents ask most.
          </p>

          {/* ── Part 1: Getting started ── */}
          <h2 className="mt-8 text-xl font-semibold text-slate-800">Getting started</h2>

          <ol className="mt-4 space-y-5">
            <li>
              <h3 className="font-semibold text-slate-800">1. Create your parent account</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Continue with Google, or enter your name and email. For email sign-up
                we&apos;ll send a 6-digit code to verify your account (it expires after a
                few minutes — request a new one if it lapses). You&apos;ll agree to our
                Terms &amp; Privacy Policy and acknowledge that writing tasks are marked
                by AI before finishing.
              </p>
            </li>
            <li>
              <h3 className="font-semibold text-slate-800">2. Add your child</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                From your dashboard, add a child profile with their name, year level
                (3, 5, 7, or 9), and a username + 4-digit PIN they&apos;ll use to log in.
                You can add more than one child to the same account.
              </p>
            </li>
            <li>
              <h3 className="font-semibold text-slate-800">3. Your child takes a practice test</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Your child signs in with their username and PIN, picks a test for their
                year level, and works through NAPLAN-style questions. For writing tasks
                they can type their answer or take a photo of their handwriting.
              </p>
            </li>
            <li>
              <h3 className="font-semibold text-slate-800">4. Read the results and feedback</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                As soon as a test is finished, your child gets a score plus topic-by-topic
                feedback — strengths, areas to improve, and study tips. You can review it
                all from your parent dashboard to track progress.
              </p>
            </li>
            <li>
              <h3 className="font-semibold text-slate-800">5. Unlock more with a Practice Pack</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Your first full-length practice test is free — no credit card needed. To
                keep going, buy a Practice Pack for your child&apos;s year level. Packs are
                <strong> one-time purchases</strong> (no subscription, no recurring charges),
                starting at <strong>A$19</strong> for Year 3. Browse all packs and current
                prices on the{" "}
                <Link to="/bundles" className="text-indigo-600 underline hover:text-indigo-700">
                  Practice Packs page
                </Link>.
              </p>
            </li>
          </ol>

          {/* ── Part 2: FAQ ── */}
          <h2 className="mt-10 text-xl font-semibold text-slate-800">Frequently asked questions</h2>

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-400">About the AI marking</h3>
          <Faq q="Is my child's writing really marked by AI, not a teacher?">
            Yes. Writing tasks are read and graded automatically by Google&apos;s Gemini AI,
            not by a human teacher. We&apos;re upfront about this because you should know
            exactly how your child&apos;s work is assessed.
          </Faq>
          <Faq q="Is the AI marking accurate?">
            It&apos;s a helpful guide, but not perfect — it can occasionally mis-score an
            answer or misread messy handwriting. Please treat results as{" "}
            <strong>practice feedback, not an official NAPLAN result</strong>.
          </Faq>
          <Faq q="What happens to the photo of my child's handwriting?">
            The image is sent to Google&apos;s Gemini AI to be read and graded, then the
            result comes back to us. We use Google&apos;s paid service; under its terms
            Google <strong>does not use your child&apos;s work to train its AI models</strong>{" "}
            and keeps it only briefly (up to ~55 days) for security and legal reasons.
            Because Google&apos;s systems run overseas, the work may be processed on servers
            outside Australia. Full details are in our Privacy Policy.
          </Faq>
          <Faq q="Can I stop my child's work being graded by AI?">
            <Fill>choose one — (a) AI marking is core to instant writing feedback and can&apos;t be switched off; or (b) explain how a parent requests an opt-out</Fill>
          </Faq>

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-400">Privacy &amp; data</h3>
          <Faq q="Is my child's data safe? Where is it stored?">
            We take children&apos;s privacy seriously. Uploaded files are stored in Australia
            (AWS Sydney). For full details on what we collect and how it&apos;s used, see our
            Privacy Policy.
          </Faq>
          <Faq q="Do you sell my child's data?">No.</Faq>

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-400">Logging in &amp; accounts</h3>
          <Faq q="How does my child log in?">
            With the username and 4-digit PIN you set when you created their profile — they
            don&apos;t need an email address.
          </Faq>
          <Faq q="My child forgot their PIN. What do I do?">
            You can reset it from your parent dashboard. <Fill>exact steps / menu location</Fill>
          </Faq>
          <Faq q="Can I have more than one child on one account?">
            Yes. Add each child as a separate profile under your parent account, each with
            their own login and progress.
          </Faq>

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-400">The tests &amp; results</h3>
          <Faq q="Are these the real NAPLAN questions?">
            No — they&apos;re original, NAPLAN-style practice questions aligned to the
            Australian Curriculum, designed to mirror the real test&apos;s format and
            difficulty for Years 3, 5, 7, and 9.
          </Faq>
          <Faq q="Is the score an official NAPLAN result?">
            No. It&apos;s a practice score to help your child prepare and show you where to
            focus. It has no connection to official NAPLAN reporting.
          </Faq>
          <Faq q="What do the feedback sections mean?">
            After each test your child sees strengths, weaknesses, growth areas, topic-wise
            tips, and encouragement — designed to turn a score into a clear next step.
          </Faq>

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-400">Pricing &amp; payment</h3>
          <Faq q="How much does it cost?">
            Your first full-length practice test is free. After that, Practice Packs are
            <strong> one-time purchases per year level</strong> — starting at <strong>A$19</strong>{" "}
            for Year 3, with topic packs and higher year levels ranging up to about A$35.
            See current prices on the{" "}
            <Link to="/bundles" className="text-indigo-600 underline hover:text-indigo-700">
              Practice Packs page
            </Link>.
          </Faq>
          <Faq q="Is there a free trial?">
            Yes — one full-length practice test, completely free, with no credit card required.
          </Faq>
          <Faq q="Is this a subscription? How do I cancel?">
            It&apos;s not a subscription. Practice Packs are one-time purchases with no
            recurring charges, so there&apos;s nothing to cancel — you&apos;re only ever
            charged when you choose to buy a pack.
          </Faq>
          <Faq q="Do you store my card details?">
            No — payments are handled securely by Stripe, our payment provider. We never see
            or store your full card number.
          </Faq>
          <Faq q="Can I get a refund?"><Fill>refund policy</Fill></Faq>

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-400">Technical help</h3>
          <Faq q="What devices and browsers work?">
            Any modern web browser on a laptop, tablet, or phone — Chrome, Safari, Edge, or
            Firefox. A camera (or the ability to upload a photo) is handy for handwriting tasks.
          </Faq>
          <Faq q="My child can't upload a photo of their writing.">
            Make sure it&apos;s a clear, well-lit photo of English handwriting only (JPEG,
            PNG, or WebP, under 5MB). If it still won&apos;t accept the image, retake it with
            better lighting, or have your child type the answer instead.
          </Faq>
          <Faq q="Something isn't working / my question isn't here.">
            Contact us at <Fill>support email</Fill> and we&apos;ll help. We usually reply
            within <Fill>e.g. one business day</Fill>.
          </Faq>

          <p className="mt-8 text-xs text-slate-400">
            Last updated: 16-07-2026. 
            <br />
            This guide may change as we add features.
          </p>
        </div>
      </div>
    </div>
  );
}