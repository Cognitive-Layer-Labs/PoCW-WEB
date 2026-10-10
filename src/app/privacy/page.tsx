import type { Metadata } from "next";
import { LegalPage, contactEmail } from "@/components/LegalPage";

// Rendered per request so the contact email comes from the runtime env, not the build.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  const email = contactEmail();
  return (
    <LegalPage title="Privacy" updated="10 October 2026">
      <p>
        Bookmap is an early, experimental product: you add a book you&apos;ve read, it maps the book&apos;s ideas, and you can
        test yourself on it. This page explains what we keep about you and why, in plain words.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your Google account basics</strong> when you sign in: name, email address, profile picture and Google
          account ID. We never see your Google password.
        </li>
        <li>
          <strong>The books you add</strong>: the file or link, and the text taken from it, so we can build the map and
          write questions.
        </li>
        <li>
          <strong>Your tests</strong>: the questions, your answers, how they were graded and your scores.
        </li>
        <li>
          <strong>Your choice about update emails</strong>, and when you made it.
        </li>
        <li>
          <strong>Technical logs</strong>, such as IP addresses, kept briefly for security and to stop abuse.
        </li>
      </ul>
      <p>We use one cookie, to keep you signed in. There are no advertising or tracking cookies.</p>

      <h2>How we use it</h2>
      <ul>
        <li>To run Bookmap: your shelf, the maps, the tests and your history.</li>
        <li>To understand how the product is used and improve it, including a private admin view of sign-ups, books and scores.</li>
        <li>To contact you about your account or the service if we need to.</li>
        <li>To send you news about Bookmap, only if you said yes. You can change your mind at any time by emailing us.</li>
      </ul>
      <p>We don&apos;t sell your data and we don&apos;t use it for advertising.</p>

      <h2>Who else handles it</h2>
      <ul>
        <li>Google, for sign-in.</li>
        <li>
          OpenRouter and the AI model providers it routes to: passages from your book and your answers are sent to them to
          build the map, write questions and grade answers.
        </li>
        <li>Cloudflare, which sits in front of the site, and the company that hosts our server.</li>
      </ul>

      <h2>Shared results</h2>
      <p>
        If you share a result, anyone with the link can see your first name, the book&apos;s title and your score. Nothing
        else is public, and your shelf stays private.
      </p>

      <h2>Keeping and deleting your data</h2>
      <p>
        We keep your data while your account exists. You can remove a book from your shelf at any time. To get a copy of
        your data or to delete your account and everything in it, email us{email ? <> at <a href={`mailto:${email}`}>{email}</a></> : null}
        , and we&apos;ll do it within 30 days.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the GDPR you can ask to access, correct, delete or export your data, and object to how we use it. You can
        also complain to your data protection authority (in Romania, ANSPDCP).
      </p>

      <h2>Changes</h2>
      <p>If this policy changes in a way that matters, we&apos;ll say so on the site and update the date above.</p>
    </LegalPage>
  );
}
