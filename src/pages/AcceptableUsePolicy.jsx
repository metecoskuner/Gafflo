import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout'

export default function AcceptableUsePolicy() {
  return (
    <LegalPageLayout eyebrow="Legal" title="Acceptable Use / Listing Rules" updated="21 August 2026">
      <LegalSection title="For everyone">
        <p>
          Be honest and be a real person acting on your own behalf. Don't impersonate someone else, create
          multiple accounts to evade a block or restriction, or use Gafflo to harass, threaten, or abuse another
          user in messages, reports, or anywhere else on the platform.
        </p>
      </LegalSection>

      <LegalSection title="For landlords">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>List properties you genuinely have the right to rent out, with accurate rent, deposit, and availability.</li>
          <li>Use real, unedited photos of the actual property.</li>
          <li>Follow our <span className="font-semibold text-slate-800">Fair Housing Policy</span> in every listing's title and description.</li>
          <li>Respond to applicants and messages in good faith; don't collect payment outside of a genuine tenancy process.</li>
        </ul>
      </LegalSection>

      <LegalSection title="For tenants">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Provide accurate information in your profile and applications.</li>
          <li>Use the report feature for genuine concerns, not as a way to pressure a landlord or settle a dispute.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Enforcement">
        <p>
          Violating these rules can result in a listing being rejected or removed, or an account being restricted,
          at Gafflo's discretion.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
