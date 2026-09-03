import { BadRequestException } from "@nestjs/common";
import { TelegramNotificationProvider } from "./telegram.provider";

const payload = {
  sourceLabel: "TG频道",
  targetName: "OpenAI News",
  author: "",
  content: "OpenAI announces GPT-5",
  url: "https://t.me/openai_news/456"
};

describe("TelegramNotificationProvider", () => {
  let provider: TelegramNotificationProvider;
  const fetchMock = jest.fn();

  beforeEach(() => {
    provider = new TelegramNotificationProvider();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    // Restore is handled by the next assignment; nothing to clean up here.
  });

  describe("buildText", () => {
    it("renders one element per line with channel, target, content and url", () => {
      const text = TelegramNotificationProvider.buildText(payload);

      expect(text).toBe(
        "【TG频道】\n【OpenAI News】\nOpenAI announces GPT-5\n原文：https://t.me/openai_news/456"
      );
    });

    it("includes speaker for group messages with an author", () => {
      const text = TelegramNotificationProvider.buildText({
        sourceLabel: "TG群组",
        targetName: "haha",
        author: "张三",
        content: "大家好",
        url: null
      });

      expect(text).toBe("【TG群组】\n【haha】\n【张三】\n大家好");
    });

    it("renders X messages without a speaker", () => {
      const text = TelegramNotificationProvider.buildText({
        sourceLabel: "X",
        targetName: "OpenAI",
        author: "",
        content: "GPT-5 is here",
        url: "https://x.com/OpenAI/status/123"
      });

      expect(text).toBe(
        "【X】\n【OpenAI】\nGPT-5 is here\n原文：https://x.com/OpenAI/status/123"
      );
    });

    it("omits empty url and speaker lines", () => {
      const text = TelegramNotificationProvider.buildText({
        sourceLabel: "TG频道",
        targetName: "OpenAI News",
        author: "",
        content: "hello",
        url: null
      });

      expect(text).toBe("【TG频道】\n【OpenAI News】\nhello");
    });

    it("truncates messages longer than 4096 characters", () => {
      const long = "x".repeat(5000);
      const text = TelegramNotificationProvider.buildText({
        sourceLabel: "TG频道",
        targetName: "OpenAI News",
        author: "",
        content: long,
        url: null
      });

      expect(text.length).toBeLessThanOrEqual(4096);
      expect(text.endsWith("...")).toBe(true);
    });
  });

  describe("send", () => {
    it("calls the Telegram Bot API with the rendered text", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"ok":true}'
      });

      await provider.send(
        { botToken: "token", chatId: "123" },
        payload
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.telegram.org/bottoken/sendMessage",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            chat_id: "123",
            text: TelegramNotificationProvider.buildText(payload)
          })
        })
      );
    });

    it("throws when the Bot API responds with an error", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => '{"description":"Bad Request: chat not found"}'
      });

      await expect(
        provider.send({ botToken: "token", chatId: "123" }, payload)
      ).rejects.toThrow("Telegram Bot API error");
    });

    it("rejects a config missing botToken or chatId", async () => {
      await expect(
        provider.send({ botToken: "token" }, payload)
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
