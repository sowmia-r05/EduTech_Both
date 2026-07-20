import React from "react";

// ─────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for Terms & Conditions text.
// TermsPage.jsx renders this inside a full-page layout; modals
// render it directly. Never duplicate this text — edit it here.
//
// ⚠️ FILL THESE IN before deploy. Every one appears in published
// legal text, so a placeholder shipping to production is a
// misrepresentation, not a cosmetic bug.
// ─────────────────────────────────────────────────────────────
const BUSINESS_NAME = "KAI Solutions";
const ABN = "[[ABN — 11 digits, e.g. 12 345 678 901]]";
const WEBSITE = "naplan.kaisolutions.ai";
const SUPPORT_EMAIL = "[[support@yourdomain — must actually receive mail]]";
const JURISDICTION = "[[State or Territory, e.g. New South Wales]]";
const EFFECTIVE_DATE = "[[DD-MM-YYYY of publication]]";

export default function TermsAndConditions({ variant = "modal" }) {
  const wrapper =
    variant === "page"
      ? "space-y-6 text-sm text-gray-700"
      : "max-h-96 overflow-y-auto p-6 bg-gray-50 rounded-xl border text-sm text-gray-700 space-y-6";

  const Heading = variant === "page" ? "h1" : "h2";
  const headingClass =
    variant === "page"
      ? "text-2xl font-bold text-indigo-600 mb-2"
      : "text-xl font-bold text-indigo-600 mb-2";

  return (
    <div className={wrapper}>
      <div>
        <Heading className={headingClass}>Terms and Conditions</Heading>
        <p><strong>Effective Date:</strong> {EFFECTIVE_DATE}</p>
        <p><strong>Business Name:</strong> {BUSINESS_NAME}</p>
        <p><strong>ABN:</strong> {ABN}</p>
        <p><strong>Website:</strong> {WEBSITE}</p>
      </div>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h3>
        <p>
          By accessing or using our platform, you agree to be bound by these Terms and
          Conditions. If you do not agree, you must not use the platform.
        </p>
        <p className="mt-2">
          If you are registering on behalf of a child, you confirm that you are the child's
          parent or legal guardian and that you consent to our collection and handling of
          that child's information as described in our Privacy Policy.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">2. Description of Service</h3>
        <p>
          We provide online NAPLAN-style practice assessments designed to support student
          learning and exam preparation.
        </p>
        <p className="mt-2">We may update, modify, or discontinue features at any time.</p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">3. Eligibility</h3>
        <p>
          Accounts must be created by a parent or legal guardian if the student is under
          18 years of age.
        </p>
        <p className="mt-2">
          You agree that all information provided during registration is accurate and current.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">4. Account Responsibility</h3>
        <p>You are responsible for:</p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Maintaining the confidentiality of your account</li>
          <li>All activity that occurs under your account</li>
          <li>Ensuring the student uses the platform appropriately</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">5. Intellectual Property</h3>
        <p>
          All test questions, materials, branding, and content are owned by {BUSINESS_NAME}.
          You may not:
        </p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Copy or reproduce questions</li>
          <li>Share content publicly</li>
          <li>Resell or distribute materials</li>
          <li>Reverse engineer the platform</li>
        </ul>
        <p className="mt-2">Unauthorised use may result in account suspension.</p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">6. Payments and Refunds</h3>
        <ul className="list-disc ml-6 space-y-1">
          <li>Fees are displayed at checkout in Australian dollars, inclusive of GST</li>
          <li>Bundles are one-time purchases — there are no recurring charges</li>
          <li>We may change pricing for future purchases with notice</li>
          <li>Payments are processed by Stripe; we do not store your card details</li>
        </ul>
        <p className="mt-2">
          Our goods and services come with guarantees that cannot be excluded under the
          Australian Consumer Law. You are entitled to a replacement or refund for a major
          failure, and to compensation for any other reasonably foreseeable loss or damage.
          You are also entitled to have the service remedied if it is not of acceptable
          quality and the failure does not amount to a major failure.
        </p>
        <p className="mt-2">
          Because access to purchased practice material is granted immediately on payment,
          change-of-mind refunds are at our discretion. To request a refund, contact{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          with your invoice number. We aim to respond within 5 business days. Approved
          refunds are returned to the original payment method.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">7. Educational Disclaimer</h3>
        <p>
          Our assessments are practice materials only and are not affiliated with or endorsed
          by official NAPLAN authorities.
        </p>
        <p className="mt-2">We do not guarantee specific academic outcomes.</p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">
          8. Automated Processing and Third-Party Services
        </h3>
        <p>
          Some features use automated systems provided by third parties. In particular,
          where a student submits a photograph of handwritten work, that image is sent to a
          third-party service for transcription, and written responses may be sent to a
          third-party service to generate feedback.
        </p>
        <p className="mt-2">
          Automated feedback is a learning aid and may contain errors. It is not a
          substitute for assessment by a teacher. The third-party services we use, and the
          countries they operate in, are listed in our Privacy Policy.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">9. Limitation of Liability</h3>
        <p>
          Nothing in these Terms excludes, restricts or modifies any guarantee, right or
          remedy you have under the Australian Consumer Law.
        </p>
        <p className="mt-2">
          To the extent permitted by law, and subject to the paragraph above, our liability
          for any failure to comply with a consumer guarantee is limited to resupplying the
          service or paying the cost of having it resupplied. To the extent permitted by
          law, we are not liable for indirect or consequential loss.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">
          10. Account Termination and Data Deletion
        </h3>
        <p>We may suspend or terminate accounts that:</p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Violate these Terms</li>
          <li>Misuse content</li>
          <li>Engage in fraudulent activity</li>
        </ul>
        <p className="mt-2">
          You may close your account at any time by contacting{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>
          . On closure we delete or de-identify the account and associated student records
          as described in our Privacy Policy, other than records we are required to retain
          for tax or legal purposes.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">11. Changes to These Terms</h3>
        <p>
          We may update these Terms from time to time. The Effective Date above shows when
          they were last changed. Material changes will be notified to registered parents by
          email. Continued use after that notice constitutes acceptance.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">12. Governing Law</h3>
        <p>
          These Terms are governed by the laws of {JURISDICTION}, Australia. You submit to
          the non-exclusive jurisdiction of the courts of that State or Territory.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">13. Contact Information</h3>
        <p>For questions regarding these Terms, contact:</p>
        <p className="mt-2">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p>{BUSINESS_NAME} · ABN {ABN}</p>
      </section>
    </div>
  );
}