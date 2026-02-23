import React from "react";

export default function PrivacyPolicy() {
  return (
    <div className="max-h-96 overflow-y-auto p-6 bg-gray-50 rounded-xl border text-sm text-gray-700 space-y-6">

      <div>
        <h2 className="text-xl font-bold text-indigo-600 mb-2">
          Privacy Policy
        </h2>
        <p><strong>Effective Date:</strong> [Insert Date]</p>
        <p><strong>Business Name:</strong> KAI Solutions</p>
      </div>

      <section>
        <p>
          We respect your privacy and are committed to protecting personal
          information in accordance with the Australian Privacy Principles (APP).
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">
          1. Information We Collect
        </h3>

        <p>We may collect:</p>

        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Parent name</li>
          <li>Parent email address</li>
          <li>Student first name</li>
          <li>Student year level</li>
          <li>Test responses and results</li>
          <li>Device/browser information</li>
        </ul>

        <p className="mt-2">
          We do NOT intentionally collect sensitive information.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">
          2. How We Use Information
        </h3>

        <p>We use information to:</p>

        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Provide assessments</li>
          <li>Personalise test experience</li>
          <li>Store results</li>
          <li>Improve our platform</li>
          <li>Communicate with parents</li>
        </ul>

        <p className="mt-2">
          We do not sell personal information.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">
          3. Children’s Privacy
        </h3>

        <p>
          Accounts for students under 18 must be created by a parent or
          legal guardian.
        </p>

        <p className="mt-2">
          We rely on parental consent for collection of student information.
        </p>

        <p className="mt-2">
          Parents may request deletion of their child’s data at any time.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">
          4. Data Storage & Security
        </h3>

        <p>We take reasonable steps to protect personal information through:</p>

        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Secure servers</li>
          <li>Encrypted connections (SSL)</li>
          <li>Restricted access controls</li>
        </ul>

        <p className="mt-2">
          However, no system can guarantee absolute security.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">
          5. Data Retention
        </h3>

        <p>
          We retain information as long as the account remains active
          or as required by law.
        </p>

        <p className="mt-2">
          You may request deletion of your account at any time.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">
          6. Third-Party Services
        </h3>

        <p>
          We may use third-party services (such as hosting providers
          or analytics tools) to operate the platform.
        </p>

        <p className="mt-2">
          These providers are required to protect your information.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">
          7. Access & Correction
        </h3>

        <p>
          You may request access to or correction of your personal
          information by contacting us.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">
          8. Updates to This Policy
        </h3>

        <p>
          We may update this Privacy Policy from time to time.
          Continued use of the platform indicates acceptance of updates.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">
          9. Contact Us
        </h3>

        <p>
          For privacy-related questions or data deletion requests:
        </p>

        <p className="mt-2">[Your Support Email]</p>
        <p>KAI Solutions</p>
      </section>

    </div>
  );
}