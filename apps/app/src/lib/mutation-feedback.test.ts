import { beginMutationFeedback } from "./mutation-feedback";

describe("mutation feedback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps default success feedback brief so fast mutations do not feel slow", async () => {
    vi.useFakeTimers();
    const feedback = beginMutationFeedback();
    let settled = false;

    const wait = feedback.waitForSuccess().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(149);
    expect(settled).toBeFalsy();

    await vi.advanceTimersByTimeAsync(1);
    await wait;
    expect(settled).toBeTruthy();
  });

  it("keeps successful feedback pending for the remaining minimum duration", async () => {
    vi.useFakeTimers();
    const feedback = beginMutationFeedback({ minimumDurationMs: 500 });
    let settled = false;

    const wait = feedback.waitForSuccess().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBeFalsy();

    await vi.advanceTimersByTimeAsync(1);
    await wait;
    expect(settled).toBeTruthy();
  });

  it("does not wait once the minimum duration has already elapsed", async () => {
    vi.useFakeTimers();
    const feedback = beginMutationFeedback({ minimumDurationMs: 500 });

    await vi.advanceTimersByTimeAsync(500);
    await expect(feedback.waitForSuccess()).resolves.toBeUndefined();
  });
});
