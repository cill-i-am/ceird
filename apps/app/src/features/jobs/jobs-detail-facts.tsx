import type { JobContactDetail, JobContactOption } from "@ceird/jobs-core";

import {
  formatDetailDate,
  formatDetailDateTime,
} from "./jobs-detail-formatting";

export function JobDetailFactsCard({
  assigneeName,
  contact,
  coordinatorName,
  createdAt,
  externalReference,
  serviceAreaName,
  updatedAt,
}: {
  readonly assigneeName?: string;
  readonly contact?: JobContactDetail | JobContactOption;
  readonly coordinatorName?: string;
  readonly createdAt: string;
  readonly externalReference?: string;
  readonly serviceAreaName?: string;
  readonly updatedAt: string;
}) {
  const contactSupporting = getContactSupportingText(contact);
  const contactNotes =
    contact && "notes" in contact ? contact.notes : undefined;

  return (
    <section className="rounded-lg border bg-background">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">Job details</h3>
      </div>
      <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
        <HeaderMetaItem
          label="Assignee"
          value={assigneeName ?? "Unassigned"}
          supporting={coordinatorName ? `Coordinator: ${coordinatorName}` : ""}
        />
        <HeaderMetaItem
          label="Contact"
          value={contact?.name ?? "No contact yet"}
          supporting={contactSupporting}
        />
        <HeaderMetaItem
          label="Service area"
          value={serviceAreaName ?? "No service area yet"}
        />
        <HeaderMetaItem
          label="Reference"
          value={externalReference ?? "No external reference"}
        />
        <HeaderMetaItem label="Created" value={formatDetailDate(createdAt)} />
        <HeaderMetaItem
          label="Updated"
          value={formatDetailDateTime(updatedAt)}
        />
        {contactNotes ? (
          <div className="min-w-0 text-left sm:col-span-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase">
              Contact notes
            </p>
            <p className="mt-1 text-sm leading-6 break-words whitespace-pre-wrap text-foreground">
              {contactNotes}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function getContactSupportingText(
  contact: JobContactDetail | JobContactOption | undefined
) {
  return [contact?.email, contact?.phone].filter(Boolean).join(" · ");
}

function HeaderMetaItem({
  label,
  supporting,
  value,
}: {
  readonly label: string;
  readonly supporting?: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0 text-left">
      <p className="text-[11px] font-medium text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">
        {value}
      </p>
      {supporting ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {supporting}
        </p>
      ) : null}
    </div>
  );
}
