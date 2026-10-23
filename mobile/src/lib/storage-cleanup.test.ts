import { removeReplacedImage, storagePathFromPublicUrl } from "./storage-cleanup";

const mockRemove = jest.fn(async () => ({ data: [], error: null }));
jest.mock("./supabase", () => ({
  supabase: { storage: { from: () => ({ remove: mockRemove }) } },
}));

const OLD =
  "https://x.supabase.co/storage/v1/object/public/menu-images/RS-1/a%20b.jpg?t=1";

describe("storagePathFromPublicUrl", () => {
  it("reads the path inside the bucket, and nothing outside it", () => {
    expect(storagePathFromPublicUrl(OLD, "menu-images")).toBe("RS-1/a b.jpg");
    expect(storagePathFromPublicUrl(OLD, "gcash-qr")).toBeNull();
    expect(
      storagePathFromPublicUrl("https://elsewhere.test/a.jpg", "menu-images")
    ).toBeNull();
    expect(
      storagePathFromPublicUrl(
        "https://x.supabase.co/storage/v1/object/public/menu-images/RS-1/../RS-2/a.jpg",
        "menu-images"
      )
    ).toBeNull();
    expect(storagePathFromPublicUrl(null, "menu-images")).toBeNull();
  });
});

describe("removeReplacedImage", () => {
  beforeEach(() => mockRemove.mockClear());

  it("removes the old photo only when it was replaced", async () => {
    await removeReplacedImage("menu-images", OLD, "https://x/new.jpg");
    expect(mockRemove).toHaveBeenCalledWith(["RS-1/a b.jpg"]);
    mockRemove.mockClear();
    await removeReplacedImage("menu-images", OLD, OLD);
    await removeReplacedImage("menu-images", null, "https://x/new.jpg");
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
