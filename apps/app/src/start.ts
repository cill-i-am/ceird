import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

import { requestAppContextMiddleware } from "./features/auth/app-context-request-middleware";

const serverFunctionCsrfMiddleware = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [
    serverFunctionCsrfMiddleware,
    requestAppContextMiddleware,
  ],
}));
