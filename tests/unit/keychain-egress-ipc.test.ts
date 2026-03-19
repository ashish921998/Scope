import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const keytarMock = {
  setPassword: vi.fn(async () => {}),
  getPassword: vi.fn(async () => "stored-secret"),
  deletePassword: vi.fn(async () => true)
};

vi.mock("keytar", () => ({
  default: keytarMock
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    })
  }
}));

vi.mock("../../apps/desktop/src/auth/oauth", () => ({
  connectIntegrationOAuth: vi.fn()
}));

describe("keychain and desktop IPC", () => {
  beforeEach(() => {
    handlers.clear();
    keytarMock.setPassword.mockClear();
    keytarMock.getPassword.mockClear();
    keytarMock.deletePassword.mockClear();
  });

  it("stores, fetches, and deletes Deepgram keys", async () => {
    const { KeychainStore } = await import("../../apps/desktop/src/security/keychain");
    const store = new KeychainStore();

    await store.saveProviderKey("deepgram", "dg-secret");
    expect(keytarMock.setPassword).toHaveBeenCalledWith("com.scope.desktop", "provider:deepgram", "dg-secret");

    await expect(store.getProviderKey("deepgram")).resolves.toBe("stored-secret");
    expect(keytarMock.getPassword).toHaveBeenCalledWith("com.scope.desktop", "provider:deepgram");

    await store.deleteProviderKey("deepgram");
    expect(keytarMock.deletePassword).toHaveBeenCalledWith("com.scope.desktop", "provider:deepgram");
  });

  it("accepts Deepgram through the saveProviderKey IPC flow", async () => {
    const { registerIpcHandlers } = await import("../../apps/desktop/src/ipc/registerIpc");
    const saveProviderKey = vi.fn(async () => {});

    registerIpcHandlers({
      captureService: {} as never,
      keychainStore: {
        saveProviderKey,
        getProviderKey: async () => null
      } as never,
      servicePort: 4010,
      serviceToken: "token",
      rendererUrl: "http://127.0.0.1:3000"
    });

    const handler = handlers.get("keys/saveProviderKey");
    expect(handler).toBeTruthy();

    const result = await handler?.(
      {
        senderFrame: { url: "http://127.0.0.1:3000" }
      },
      "deepgram",
      "dg-secret"
    );

    expect(saveProviderKey).toHaveBeenCalledWith("deepgram", "dg-secret");
    expect(result).toEqual({ ok: true });
  });
});

describe("egress allowlist", () => {
  it("allows Deepgram and blocks unknown hosts", async () => {
    const { assertAllowedEgress } = await import("../../packages/core/src/security/egress");

    expect(() => assertAllowedEgress("https://api.deepgram.com/v1/listen")).not.toThrow();
    expect(() => assertAllowedEgress("https://blocked.example.com/")).toThrow("Blocked network egress");
  });
});
