import { Link } from 'react-router-dom'
import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout'

export default function TermsOfService() {
  return (
    <LegalPageLayout eyebrow="Legal" title="Terms of Service" updated="21 August 2026">
      <LegalSection title="What Gafflo is">
        <p>
          Gafflo is a rental listings marketplace connecting tenants and landlords in Ireland. We help tenants
          discover and apply to rental listings, and help landlords list properties, review applicants, and
          coordinate viewings. Gafflo is not a party to any tenancy agreement, does not collect rent or deposits,
          and does not provide legal, financial, or tenancy advice.
        </p>
      </LegalSection>

      <LegalSection title="Eligibility and your account">
        <p>
          You must be at least 18 years old to create a Gafflo account. You are responsible for the accuracy of
          the information you provide, and for keeping your account credentials secure. One account represents
          one real person.
        </p>
      </LegalSection>

      <LegalSection title="Listings">
        <p>
          Landlords are responsible for the accuracy and legality of their own listing content, including
          compliance with Ireland's Equal Status Acts and any other applicable housing law. Listings go through a
          review step before becoming publicly visible, but that review does not guarantee accuracy or legality —
          see our <Link className="font-semibold text-indigo-700 underline" to="/legal/fair-housing">Fair Housing Policy</Link>.
          Gafflo may reject, remove, or request changes to a listing at its discretion, including in response to a
          report from another user.
        </p>
      </LegalSection>

      <LegalSection title="Applications, messaging, and viewings">
        <p>
          Applications, messages, and viewing arrangements happen through Gafflo, but the resulting tenancy — if
          any — is a private arrangement between tenant and landlord. Gafflo does not vet, guarantee, or take
          responsibility for the conduct of either party, and does not perform tenant screening or credit checks.
        </p>
      </LegalSection>

      <LegalSection title="Reporting and enforcement">
        <p>
          Any user can report a listing that appears to violate these Terms or our Fair Housing Policy. We may
          review, warn, restrict, or remove an account or listing based on a report or our own review, at our
          discretion.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>
          Don't use Gafflo to post false or misleading listings, harass or discriminate against another user,
          scrape or misuse other users' data, or attempt to circumvent the platform's safety or moderation
          features.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these Terms">
        <p>
          We may update these Terms as Gafflo's features change. Material changes will be reflected by updating
          the date at the top of this page.
        </p>
      </LegalSection>

      <LegalSection title="Not legal advice">
        <p>
          This page describes how Gafflo works and is provided for general information only. It is not legal
          advice, and nothing here should be relied on as such. If you have questions about your rights or
          obligations as a tenant or landlord, consult a qualified professional or your local
          Residential Tenancies Board (RTB) guidance.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
