import { createFileRoute } from "@tanstack/react-router";

import { PasswordResetRequestPage } from "#/features/auth/password-reset-request-page";

export const Route = createFileRoute("/forgot-password")({
  component: PasswordResetRequestPage,
});
