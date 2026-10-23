import { postApiJson } from "./admin-api";

declare const global: { fetch: jest.Mock };

jest.mock("expo-constants", () => ({
  expoConfig: { extra: { apiUrl: "https://admin.test" } },
}));
jest.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "t" } } }),
    },
  },
}));

describe("postApiJson", () => {
  afterEach(() => jest.useRealTimers());

  it("gives up after the time limit so the caller's fallback answers", async () => {
    jest.useFakeTimers();
    // A server that never answers until the request is aborted.
    global.fetch = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(new Error("aborted")))
        )
    );
    const reply = postApiJson("/api/x", {}, 3500);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(3500);
    await expect(reply).resolves.toBeNull();
  });

  it("returns the reply when the server answers in time", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ a: 1 }) }));
    await expect(postApiJson("/api/x", {}, 3500)).resolves.toEqual({ a: 1 });
  });
});
