import React from "react";

export default function TermsAndConditions() {
  return (
    <div className="max-h-96 overflow-y-auto p-6 bg-gray-50 rounded-xl border text-sm text-gray-700 space-y-6">

      <div>
        <h2 className="text-xl font-bold text-indigo-600 mb-2">
          Terms and Conditions
        </h2>
        <p><strong>Effective Date:</strong> 23-02-2026</p>
        <p><strong>Business Name:</strong> KAI Solutions</p>
        <p><strong>Website:</strong> Sample URL</p>
      </div>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h3>
        <p>
          By accessing or using our platform, you agree to be bound by these Terms and Conditions.
          If you do not agree, you must not use the platform.
        </p>
        <p className="mt-2">
          If you are registering on behalf of a child, you confirm that you are the child’s
          parent or legal guardian.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">2. Description of Service</h3>
        <p>
          We provide online NAPLAN-style practice assessments designed to support student
          learning and exam preparation.
        </p>
        <p className="mt-2">
          We may update, modify, or discontinue features at any time.
        </p>
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
        <ul className="list-disc ml-6 space-y-1">
          <li>Maintaining the confidentiality of your account</li>
          <li>All activity that occurs under your account</li>
          <li>Ensuring the student uses the platform appropriately</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">5. Intellectual Property</h3>
        <p>
          All test questions, materials, branding, and content are owned by KAI Solutions.
        </p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Copy or reproduce questions</li>
          <li>Share content publicly</li>
          <li>Resell or distribute materials</li>
          <li>Reverse engineer the platform</li>
        </ul>
        <p className="mt-2">
          Unauthorized use may result in account suspension.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">6. Payments (If Applicable)</h3>
        <ul className="list-disc ml-6 space-y-1">
          <li>Fees are displayed at checkout</li>
          <li>Payments are non-refundable unless otherwise stated</li>
          <li>We may change pricing with notice</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">7. Educational Disclaimer</h3>
        <p>
          Our assessments are practice materials only and are not affiliated with
          or endorsed by official NAPLAN authorities.
        </p>
        <p className="mt-2">
          We do not guarantee specific academic outcomes.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">8. Limitation of Liability</h3>
        <ul className="list-disc ml-6 space-y-1">
          <li>Loss of data</li>
          <li>Service interruptions</li>
          <li>Indirect or consequential damages</li>
        </ul>
        <p className="mt-2">
          Use of the platform is at your own risk.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">9. Account Termination</h3>
        <p>We may suspend or terminate accounts that:</p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Violate these Terms</li>
          <li>Misuse content</li>
          <li>Engage in fraudulent activity</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">10. Governing Law</h3>
        <p>
          These Terms are governed by the laws of Australia.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">11. Contact Information</h3>
        <p>For questions regarding these Terms, contact:</p>
        <p className="mt-2">[Your Support Email]</p>
        <p>KAI Solutions</p>
      </section>

    </div>
  );
}