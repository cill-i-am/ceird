import { createStart } from "@tanstack/react-start";

import { requestAppContextMiddleware } from "./features/auth/app-context-middleware";

export const startInstance = createStart(() => ({
  requestMiddleware: [requestAppContextMiddleware],
}));
