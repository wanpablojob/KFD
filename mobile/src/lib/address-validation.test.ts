import {
  completeAddress,
  contactPhoneProblem,
  validateAddress,
  ADDRESS_LIMIT,
} from "./address-validation";

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

describe("completeAddress", () => {
  it("leaves the address alone when no barangay was picked", () => {
    expect(completeAddress("12 Katipunan St.")).toBe("12 Katipunan St.");
    expect(completeAddress("12 Katipunan St.", null)).toBe("12 Katipunan St.");
  });

  it("appends the picked barangay", () => {
    expect(completeAddress("12 Katipunan St.", "Poblacion")).toBe(
      "12 Katipunan St., Barangay Poblacion"
    );
  });

  it("does not repeat a barangay already in the address", () => {
    expect(completeAddress("12 Katipunan St., Barangay Poblacion", "Poblacion")).toBe(
      "12 Katipunan St., Barangay Poblacion"
    );
    expect(completeAddress("12 Katipunan St., Brgy. Poblacion", "poblacion")).toBe(
      "12 Katipunan St., Brgy. Poblacion"
    );
  });

  it("tidies a trailing comma before appending", () => {
    expect(completeAddress("12 Katipunan St., ", "Poblacion")).toBe(
      "12 Katipunan St., Barangay Poblacion"
    );
  });

  it("does not invent an address from a barangay alone", () => {
    expect(completeAddress("   ", "Poblacion")).toBe("");
  });

  it("produces an address the validator accepts", () => {
    const complete = completeAddress("12 Mabini St.", "Poblacion");
    expect(validateAddress(complete)).toBeNull();
  });
});

describe("contactPhoneProblem", () => {
  it("accepts mobile and landline numbers with spacing", () => {
    expect(contactPhoneProblem("0917 123 4567")).toBeNull();
    expect(contactPhoneProblem("+63 917-123-4567")).toBeNull();
    expect(contactPhoneProblem("471 2345")).toBeNull();
  });

  it("refuses empty, too short, too long and lettered numbers", () => {
    expect(contactPhoneProblem("  ")).toMatch(/Add a contact number/);
    expect(contactPhoneProblem("12345")).toMatch(/valid contact number/);
    expect(contactPhoneProblem("1234567890123456")).toMatch(/valid contact number/);
    expect(contactPhoneProblem("0917 CALL ME")).toMatch(/valid contact number/);
  });
});
