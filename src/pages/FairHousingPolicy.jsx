import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout'

export default function FairHousingPolicy() {
  return (
    <LegalPageLayout eyebrow="Legal" title="Fair Housing Policy" updated="21 August 2026">
      <LegalSection title="Our commitment">
        <p>
          Gafflo does not tolerate discrimination in housing. Every landlord using Gafflo must comply with
          Ireland's Equal Status Acts, which prohibit discrimination in the provision of accommodation on the
          following grounds:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Gender</li>
          <li>Civil status</li>
          <li>Family status</li>
          <li>Age</li>
          <li>Disability</li>
          <li>Sexual orientation</li>
          <li>Race, nationality, or ethnic or national origins</li>
          <li>Religion</li>
          <li>Membership of the Traveller community</li>
          <li>Being in receipt of rent supplement, housing assistance (including HAP), or another social welfare payment</li>
        </ul>
      </LegalSection>

      <LegalSection title="What this means for listings">
        <p>
          Listing titles and descriptions must describe the property, not the kind of person you'd prefer to
          rent to. Don't write requirements or preferences tied to any of the grounds above — for example,
          excluding families with children, stating a religious or nationality preference, or refusing tenants
          who receive HAP or another housing payment.
        </p>
        <p>
          Genuine, space-based occupancy limits (how many people a unit can reasonably hold) are not
          discriminatory and are expected. A landlord's own policy on a shared-household room listing (such as
          whether the room suits a couple, given the existing household) is a different, narrower case — if
          you're unsure whether something you want to write is appropriate, describe the practical constraint
          itself rather than the kind of applicant.
        </p>
      </LegalSection>

      <LegalSection title="How we help, honestly">
        <p>
          Gafflo shows a short reminder when you're writing a listing description, and any user can report a
          listing that looks like it doesn't comply. We review reports and can reject, request changes to, or
          remove a listing. We do not run automated keyword blocking on listing text today — a keyword filter is
          easy to get wrong in both directions, and we'd rather rely on clear guidance plus real human review than
          ship something that blocks honest listings or misses real violations. This may change as the platform
          grows.
        </p>
      </LegalSection>

      <LegalSection title="Acknowledgement">
        <p>
          Before requesting review for a listing, landlords must acknowledge this policy once. That
          acknowledgement is tied to your account, not to any single listing.
        </p>
      </LegalSection>

      <LegalSection title="Not legal advice">
        <p>
          This page is a plain-language summary to help landlords list responsibly. It does not cover every
          situation and is not a substitute for legal advice on your specific circumstances.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
