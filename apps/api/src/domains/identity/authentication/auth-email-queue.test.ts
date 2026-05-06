import { decodeAuthEmailQueueMessageStrict } from "./auth-email-queue.js";

describe("auth email queue messages", () => {
  it("decodes password reset messages", () => {
    expect(
      decodeAuthEmailQueueMessageStrict({
        kind: "password-reset",
        payload: {
          deliveryKey:
            "password-reset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          recipientEmail: "user@example.com",
          recipientName: "User",
          resetUrl: "https://app.example.com/reset-password?token=abc",
        },
      })
    ).toMatchObject({ kind: "password-reset" });
  }, 1000);

  it("rejects malformed messages", () => {
    expect(() =>
      decodeAuthEmailQueueMessageStrict({
        kind: "password-reset",
        payload: {
          recipientEmail: "not-an-email",
        },
      })
    ).toThrow("Invalid auth email queue message");
  }, 1000);
});
