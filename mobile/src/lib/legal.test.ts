import { legalUrl } from "./legal";

jest.mock("expo-constants", () => ({ expoConfig: { extra: {} } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

describe("legalUrl", () => {
  it("points at the website page on the API host", () => {
    expect(legalUrl("privacy", "https://kfd.example")).toBe(
      "https://kfd.example/privacy"
    );
  });

  it("does not double a trailing slash", () => {
    expect(legalUrl("terms", "https://kfd.example/")).toBe("https://kfd.example/terms");
  });

  it("is null when the build has no API host, so no dead link shows", () => {
    expect(legalUrl("privacy", undefined)).toBeNull();
  });
});
