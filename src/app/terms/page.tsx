import type { Metadata } from "next";
import { LegalPage, contactEmail } from "@/components/LegalPage";

// Rendered per request so the contact email comes from the runtime env, not the build.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  const email = contactEmail();
  return (
    <LegalPage title="Terms" updated="10 October 2026">
      <p>By using Bookmap you agree to these terms. They&apos;re short because the product is young.</p>

      <h2>An early product</h2>
      <p>
        Bookmap is an experiment. It&apos;s free, it may change or stop, and things may break. We provide it as is, without
        warranties.
      </p>

      <h2>Your books</h2>
      <p>
        Only add books and links you have the right to use. Copies of what you upload are stored on our server so the map
        and tests keep working. Please don&apos;t upload anything illegal or anything that isn&apos;t yours to share.
      </p>

      <h2>About the scores</h2>
      <p>
        Questions are written and answers are graded by AI models. Scores are estimates meant to help you reflect on what
        you&apos;ve read, not certificates, and they can be wrong.
      </p>

      <h2>Fair use</h2>
      <p>Don&apos;t try to break, overload or misuse the service or other people&apos;s accounts. We may suspend accounts that do.</p>

      <h2>Liability</h2>
      <p>To the extent the law allows, we aren&apos;t liable for losses that come from using Bookmap.</p>

      <h2>Contact</h2>
      <p>
        Questions? {email ? <a href={`mailto:${email}`}>{email}</a> : "Use the contact on the privacy page."} Your data is
        handled as described in our <a href="/privacy">privacy policy</a>.
      </p>
    </LegalPage>
  );
}
