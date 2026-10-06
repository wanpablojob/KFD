import { EXTERNAL_LINK_PROPS, classifyDocumentRef } from "@/lib/rider-applications";
import type { DocumentField } from "@/lib/rider-applications";

/**
 * The document references an applicant supplied.
 *
 * These are typed text, not uploads -- 0046 is explicit that there is no storage
 * bucket in this project yet -- so a value is either a link somebody pasted or
 * an opaque id. classifyDocumentRef only linkifies http(s); anything else is
 * shown as text rather than rendered as a dead or unsafe link.
 */
export function DocumentLinks({ fields }: { fields: DocumentField[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {fields.map((field) => {
        const doc = classifyDocumentRef(field.ref, field.label);
        return (
          <li key={field.label} className="text-sm">
            <span className="text-muted-foreground">{field.label}: </span>
            {doc.kind === "missing" ? (
              <span className="text-destructive">not supplied</span>
            ) : doc.kind === "link" ? (
              <a
                href={doc.href}
                {...EXTERNAL_LINK_PROPS}
                className="text-card-foreground underline underline-offset-2"
              >
                Open {doc.label.toLowerCase()}
              </a>
            ) : (
              <span className="font-mono text-xs text-card-foreground">
                {doc.label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
