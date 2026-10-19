import { completeDelivery } from "./delivery-complete";

declare const require: (id: string) => unknown;
declare const global: { fetch: jest.Mock };

jest.mock("./supabase", () => {
  const upload = jest.fn();
  return {
    supabase: { rpc: jest.fn(), storage: { from: () => ({ upload }) }, upload },
  };
});

const { supabase } = require("./supabase") as {
  supabase: { rpc: jest.Mock; upload: jest.Mock };
};

const INPUT = {
  orderId: "O-1",
  payment: "e_wallet" as const,
  orderTotal: 250,
  photoUri: "file:///proof.jpg",
  cashCollected: "",
  gcashReference: "",
};

describe("completeDelivery", () => {
  beforeEach(() => {
    supabase.rpc.mockReset().mockResolvedValue({ error: null });
    supabase.upload.mockReset();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => "blob" });
  });

  it("uploads to the rider's folder, then closes the order with that path", async () => {
    supabase.upload.mockResolvedValue({ error: null });

    await completeDelivery("R-1", INPUT);

    expect(supabase.upload).toHaveBeenCalledWith("R-1/O-1.jpg", "blob", {
      contentType: "image/jpeg",
      upsert: false,
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "rider_mark_delivered",
      expect.objectContaining({ p_order_id: "O-1", p_proof_path: "R-1/O-1.jpg" })
    );
  });

  it("retries past a photo an earlier attempt already uploaded", async () => {
    supabase.upload.mockResolvedValue({
      error: { statusCode: "409", code: "ResourceAlreadyExists", message: "exists" },
    });

    await completeDelivery("R-1", INPUT);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("stops before the RPC when the upload genuinely fails", async () => {
    supabase.upload.mockResolvedValue({
      error: { statusCode: "500", message: "down" },
    });

    await expect(completeDelivery("R-1", INPUT)).rejects.toThrow(
      /upload the delivery photo/
    );
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
