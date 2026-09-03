import { ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { QqClientService } from "./qq-client.service";

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string, def?: string) => values[key] ?? def ?? "")
  } as unknown as ConfigService;
}

const okTokenResponse = {
  ok: true,
  status: 200,
  json: async () => ({ access_token: "tok123", expires_in: 7200 }),
  text: async () => ""
};

describe("QqClientService", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  describe("configured", () => {
    it("is false without credentials", () => {
      const service = new QqClientService(makeConfig({}));
      expect(service.configured).toBe(false);
    });

    it("is true with both credentials", () => {
      const service = new QqClientService(
        makeConfig({ QQ_APP_ID: "123", QQ_APP_SECRET: "secret" })
      );
      expect(service.configured).toBe(true);
    });
  });

  describe("getAccessToken", () => {
    it("fetches the token and caches it across calls", async () => {
      const service = new QqClientService(
        makeConfig({ QQ_APP_ID: "123", QQ_APP_SECRET: "secret" })
      );
      fetchMock.mockResolvedValue(okTokenResponse);

      const first = await service.getAccessToken();
      const second = await service.getAccessToken();

      expect(first).toBe("tok123");
      expect(second).toBe("tok123");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws QQ_NOT_CONFIGURED when credentials are missing", async () => {
      const service = new QqClientService(makeConfig({}));
      await expect(service.getAccessToken()).rejects.toBeInstanceOf(
        ServiceUnavailableException
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("sendGroupMessage", () => {
    it("POSTs plain text to the group message endpoint", async () => {
      const service = new QqClientService(
        makeConfig({ QQ_APP_ID: "123", QQ_APP_SECRET: "secret" })
      );
      fetchMock
        .mockResolvedValueOnce(okTokenResponse)
        .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });

      await service.sendGroupMessage("group_openid_1", "大家好");

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenLastCalledWith(
        "https://api.sgroup.qq.com/v2/groups/group_openid_1/messages",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "QQBot tok123"
          }),
          body: JSON.stringify({ msg_type: 0, content: "大家好" })
        })
      );
    });

    it("throws when the platform rejects the message", async () => {
      const service = new QqClientService(
        makeConfig({ QQ_APP_ID: "123", QQ_APP_SECRET: "secret" })
      );
      fetchMock
        .mockResolvedValueOnce(okTokenResponse)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => '{"message":"group not found"}'
        });

      await expect(
        service.sendGroupMessage("nope", "hi")
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe("resolveGatewayUrl", () => {
    it("returns the wss url from /gateway/bot", async () => {
      const service = new QqClientService(
        makeConfig({ QQ_APP_ID: "123", QQ_APP_SECRET: "secret" })
      );
      fetchMock
        .mockResolvedValueOnce(okTokenResponse)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ url: "wss://gateway.example/ws" })
        });

      const url = await service.resolveGatewayUrl();

      expect(url).toBe("wss://gateway.example/ws");
    });
  });
});
