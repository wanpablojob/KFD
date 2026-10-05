import { validateAddress, ADDRESS_LIMIT } from "./address-validation";

describe("validateAddress", () => {
  it("requires something", () => {
    expect(validateAddress("   ")?.message).toMatch(/Enter a delivery address/);
  });

  it("requires a house number", () => {
    expect(validateAddress("Katipunan St., Barangay Poblacion")?.message).toMatch(
      /house or building/
    );
  });

  it("requires a barangay or recognised locality", () => {
    expect(validateAddress("12 Katipunan St")?.message).toMatch(/barangay/);
  });

  it("accepts purok or sitio as a locality", () => {
    expect(validateAddress("12 Purok 3, Sitio Malaya")).toBeNull();
  });

  it("requires meaningful detail", () => {
    expect(validateAddress("12")?.message).toBeDefined();
  });

  it("accepts a realistic address", () => {
    expect(validateAddress("12 Katipunan St., Barangay Poblacion")).toBeNull();
  });

  it("caps the saved list", () => {
    expect(ADDRESS_LIMIT).toBeGreaterThan(0);
  });
});
