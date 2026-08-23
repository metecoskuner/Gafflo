import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout'
import { getSupportEmail } from '../config/support'

// Stage AE — the one real, honest answer to "how do I actually reach Gafflo," linked from Footer
// and Profile's legal section. Reuses LegalPageLayout for the same public, pre-auth, no-backend-
// call treatment as the four legal pages (see App.jsx's publicStaticPages) even though this isn't
// a legal document itself — the "reachable while signed out, zero provider dependency" shape is
// exactly what a contact page needs too.
export default function Contact() {
  const supportEmail = getSupportEmail()

  return (
    <LegalPageLayout eyebrow="Support" title="Contact Gafflo" updated="23 August 2026">
      {supportEmail ? (
        <LegalSection title="How to reach us">
          <p>
            Email{' '}
            <a href={`mailto:${supportEmail}`} className="font-semibold text-indigo-700 underline">
              {supportEmail}
            </a>{' '}
            for any of the topics below.
          </p>
        </LegalSection>
      ) : (
        <LegalSection title="How to reach us">
          <p>
            Gafflo&rsquo;s support contact details are being finalized ahead of public launch. This page will show
            a real address as soon as it&rsquo;s set up.
          </p>
        </LegalSection>
      )}

      <LegalSection title="Product and general questions">
        <p>Questions about using Gafflo as a tenant or landlord, or feedback on the product.</p>
      </LegalSection>

      <LegalSection title="Privacy and data requests">
        <p>
          To access, correct, delete, or request a copy of your personal data under GDPR — see our{' '}
          <a href="/privacy" className="font-semibold text-indigo-700 underline">Privacy Policy</a> for what we
          collect and why. Use the address above to make a request.
        </p>
      </LegalSection>

      <LegalSection title="Report a listing or safety issue">
        <p>
          For a specific listing, the fastest path is the report option on that listing&rsquo;s own page — it goes
          straight to Gafflo&rsquo;s moderators. Use the address above for anything that needs to reach us directly,
          including a concern about how a report was handled.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
