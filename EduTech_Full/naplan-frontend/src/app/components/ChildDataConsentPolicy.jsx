/**
 * ChildDataConsentPolicy.jsx
 *
 * Short, formal parental consent policy for child data collection.
 * Displayed in a pop-up modal when parent clicks the link during child creation.
 *
 * Place in: src/app/components/ChildDataConsentPolicy.jsx
 */
import React from "react";

export default function ChildDataConsentPolicy() {
  return (
    <div className="space-y-5 text-sm text-gray-700 leading-relaxed">

      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-indigo-600 mb-1">
          Parental Consent — Child Data Collection
        </h2>
        <p className="text-xs text-gray-500">
          <strong>Effective Date:</strong> 1 March 2026 &nbsp;|&nbsp;
          <strong>KAI Solutions</strong>
        </p>
      </div>

      <hr className="border-gray-200" />

      {/* 1 */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-1">1. Consent</h3>
        <p>
          By checking the consent box you confirm you are the child's parent or legal
          guardian and you consent to the collection and use of their information as
          described below, in accordance with the Australian Privacy Act 1988.
        </p>
      </section>

      {/* 2 */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-1">2. What We Collect</h3>
        <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="px-3 py-2 font-semibold text-gray-700">Data</th>
                <th className="px-3 py-2 font-semibold text-gray-700">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-2">Display name, username, year level</td>
                <td className="px-3 py-2">Account creation &amp; identification</td>
              </tr>
              <tr>
                <td className="px-3 py-2">PIN (stored as encrypted hash)</td>
                <td className="px-3 py-2">Secure child login</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Quiz responses, scores &amp; time taken</td>
                <td className="px-3 py-2">Results, progress tracking &amp; AI feedback</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          We do not collect the child's full legal name, date of birth, address, or photograph.
        </p>
      </section>

      {/* 3 */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-1">3. How We Use It</h3>
        <ul className="list-disc ml-6 space-y-1">
          <li>Delivering NAPLAN-style practice tests and scoring results.</li>
          <li>Generating AI-powered personalised feedback and study tips.</li>
          <li>Displaying progress reports on the parent dashboard.</li>
        </ul>
        <p className="mt-2">
          Child data is <strong>never</strong> used for advertising, sold to third parties,
          or shared beyond what is necessary to operate the service.
        </p>
      </section>

      {/* 4 */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-1">4. Data Security &amp; Storage</h3>
        <p>
          All data is encrypted in transit (TLS) and at rest (AES-256). PINs are
          one-way hashed and never stored in plain text. Access is restricted to
          authorised personnel only.
        </p>
      </section>

      {/* 5 */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-1">5. Deletion &amp; Your Rights</h3>
        <p>
          You may delete your child's profile at any time from the Parent Dashboard.
          All associated data (profile, quiz attempts, results, AI feedback) will be
          permanently removed within 30 days. You may also request access to or
          correction of your child's data by contacting us.
        </p>
      </section>

      {/* 6 */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-1">6. Contact</h3>
        <p className="text-xs">
          Questions? Email{" "}
          <a href="mailto:privacy@kaisolutions.com.au" className="text-indigo-600 underline">
            privacy@kaisolutions.com.au
          </a>
        </p>
      </section>

      <hr className="border-gray-200" />

      {/* Acknowledgement */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs text-amber-900 font-medium">
          By checking the consent box, you confirm you have read and understood this
          policy and consent to the collection and use of your child's information
          as described above.
        </p>
      </div>

    </div>
  );
}