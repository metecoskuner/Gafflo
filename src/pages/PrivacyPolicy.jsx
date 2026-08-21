import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout'

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout eyebrow="Legal" title="Privacy Policy" updated="21 August 2026">
      <LegalSection title="Who we are">
        <p>
          Gafflo is a rental listings marketplace operating in Ireland. This policy explains what personal data we
          collect, why, and the choices available to you. It is written to be GDPR-appropriate for an
          Ireland-based service; it is not legal advice.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <p>We collect only what Gafflo's real features need to work:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><span className="font-semibold text-slate-800">Account data:</span> your email (via Supabase Auth), display name, and which role(s) — tenant, landlord, or both — your account uses.</li>
          <li><span className="font-semibold text-slate-800">Tenant profile data:</span> rental preferences you choose to share (target area, budget, move-in date, household size, and similar), and a bio if you write one. No identity documents, proof-of-income files, or credit/background-check data are collected — Gafflo does not perform tenant screening.</li>
          <li><span className="font-semibold text-slate-800">Landlord and listing data:</span> your listing content and photos, and a snapshot of a tenant's stated preferences at the moment they apply to your listing.</li>
          <li><span className="font-semibold text-slate-800">Messages and viewing arrangements:</span> messages you send through Gafflo, and viewing times you propose or accept.</li>
          <li><span className="font-semibold text-slate-800">Listing view analytics:</span> when you open a listing's full details, we record that you (a real, signed-in account) viewed it, once per listing, for as long as your account exists. A landlord only ever sees an aggregate count of unique viewers for their own listing — never who viewed it.</li>
          <li><span className="font-semibold text-slate-800">Reports:</span> if you report a listing, we record the reason and any description you provide. Reports are visible only to Gafflo's moderators, never to the listing's landlord.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What we don't do">
        <p>
          Gafflo does not use third-party advertising or analytics cookies, does not sell personal data, and does
          not share your data with third parties except where legally required or where a service provider (such
          as our database/authentication provider, Supabase) processes it on our behalf to run the app.
        </p>
      </LegalSection>

      <LegalSection title="Why we process this data">
        <p>
          Our lawful basis is primarily performance of a contract (running the marketplace features you use) and,
          for Fair Housing Policy enforcement and report handling, our legitimate interest in keeping the
          platform safe and lawful.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          We keep your data for as long as your account is active. Some records — like application snapshots and
          listing view counts — are designed to remain accurate as a historical record even if a listing is later
          paused or removed, and are handled the same way as the rest of your account data on deletion.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          Under GDPR you have the right to access, correct, or request deletion of your personal data, and to
          request a copy of it. Gafflo does not yet offer automated self-service export or deletion — email us and
          we will action your request directly. This is a genuine, responsive process, not a placeholder; we
          expect to offer self-service tooling as Gafflo grows.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Gafflo uses only the storage strictly necessary to keep you signed in (via Supabase Auth). We do not use
          advertising, tracking, or third-party analytics cookies, so there is nothing beyond this to consent to
          today. If that changes, this policy — and how we ask for consent — will change with it.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>Questions about this policy or a data request can be sent to our support address from within the app.</p>
      </LegalSection>
    </LegalPageLayout>
  )
}
