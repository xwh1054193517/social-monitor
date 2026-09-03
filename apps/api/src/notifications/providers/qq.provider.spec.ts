import { BadRequestException } from "@nestjs/common";
import type { QqClientService } from "../../qq/qq-client.service";
import { QQNotificationProvider } from "./qq.provider";

describe("QQNotificationProvider", () => {
  const sendGroupMessage = jest.fn();
  const client = { sendGroupMessage } as unknown as QqClientService;
  let provider: QQNotificationProvider;

  beforeEach(() => {
    provider = new QQNotificationProvider(client);
    sendGroupMessage.mockReset();
    sendGroupMessage.mockResolvedValue(undefined);
  });

  it("renders the standard one-element-per-line format and sends to the group", async () => {
    await provider.send(
      { groupOpenid: "A1B2C3" },
      {
        sourceLabel: "TG群组",
        targetName: "haha",
        author: "张三",
        content: "大家好",
        url: null
      }
    );

    expect(sendGroupMessage).toHaveBeenCalledWith(
      "A1B2C3",
      "【TG群组】\n【haha】\n【张三】\n大家好"
    );
  });

  it("appends the source url when present", async () => {
    await provider.send(
      { groupOpenid: "A1B2C3" },
      {
        sourceLabel: "TG频道",
        targetName: "OpenAI News",
        author: "",
        content: "hello",
        url: "https://t.me/openai_news/456"
      }
    );

    expect(sendGroupMessage).toHaveBeenCalledWith(
      "A1B2C3",
      "【TG频道】\n【OpenAI News】\nhello\n原文：https://t.me/openai_news/456"
    );
  });

  it("truncates messages longer than 2000 characters", async () => {
    await provider.send(
      { groupOpenid: "A1B2C3" },
      {
        sourceLabel: "TG频道",
        targetName: "t",
        author: "",
        content: "x".repeat(5000),
        url: null
      }
    );

    const [groupOpenid, text] = sendGroupMessage.mock.calls[0] as [
      string,
      string
    ];
    expect(groupOpenid).toBe("A1B2C3");
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text.endsWith("...")).toBe(true);
  });

  it("rejects a config without groupOpenid", async () => {
    await expect(
      provider.send(
        {},
        {
          sourceLabel: "X",
          targetName: "t",
          author: "",
          content: "c",
          url: null
        }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sendGroupMessage).not.toHaveBeenCalled();
  });
});
