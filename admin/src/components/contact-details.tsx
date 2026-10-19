import { CONTACT, hasContactDetails } from "@/lib/site-content";

/**
 * The one rendering of KFD's support channels, shared by Support, Privacy and
 * Terms so the three pages cannot list different ways to reach us. Channels
 * still empty in site-content.ts are left out; with none at all it says so
 * plainly rather than inventing one.
 */
export function ContactDetails() {
  if (!hasContactDetails()) {
    return <p>Support contact details are being set up and will be posted here before launch.</p>;
  }
  return (
    <ul className="list-disc pl-5">
      {CONTACT.email ? (
        <li>
          Email:{" "}
          <a href={`mailto:${CONTACT.email}`} className="font-semibold text-primary underline underline-offset-2">
            {CONTACT.email}
          </a>
        </li>
      ) : null}
      {CONTACT.phone ? <li>Call or text: {CONTACT.phone}</li> : null}
      {CONTACT.messengerUrl ? (
        <li>
          Messenger:{" "}
          <a href={CONTACT.messengerUrl} className="font-semibold text-primary underline underline-offset-2">
            message us
          </a>
        </li>
      ) : null}
      {CONTACT.supportHours ? <li>Support hours: {CONTACT.supportHours}</li> : null}
    </ul>
  );
}
