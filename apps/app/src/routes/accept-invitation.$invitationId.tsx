import { createFileRoute } from "@tanstack/react-router";

import { AcceptInvitationPage } from "#/features/organizations/accept-invitation-page";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: AcceptInvitationRoute,
});

function AcceptInvitationRoute() {
  const { invitationId } = Route.useParams();

  return <AcceptInvitationPage invitationId={invitationId} />;
}
