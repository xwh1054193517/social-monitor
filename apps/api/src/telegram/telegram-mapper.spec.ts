import { MonitorTarget } from "@prisma/client";
import {
  RawTelegramMessage,
  RawTelegramSender,
  TelegramMapper
} from "./telegram-mapper";

function makeSender(overrides: Partial<RawTelegramSender> = {}): RawTelegramSender {
  return {
    id: "123456",
    username: "johndoe",
    firstName: "John",
    lastName: "Doe",
    ...overrides
  };
}

function makeTarget(): MonitorTarget {
  return {
    id: "t_1",
    type: "TG_CHANNEL",
    name: "My Channel",
    externalId: "-100123456789"
  } as MonitorTarget;
}

function makeMessage(
  overrides: Partial<RawTelegramMessage> = {}
): RawTelegramMessage {
  return {
    chatId: "-100123456789",
    messageId: 42,
    content: "hello world",
    date: 1700000000,
    sender: makeSender(),
    ...overrides
  };
}

describe("TelegramMapper", () => {
  const mapper = new TelegramMapper();

  it("maps a text message with an author", () => {
    const target = makeTarget();
    const message = makeMessage();

    const result = mapper.toNormalizedMessage(
      target,
      message,
      TelegramMapper.buildExternalId("-100123456789", 42)
    );

    expect(result).toMatchObject({
      source: "TELEGRAM",
      externalId: "-100123456789:42",
      targetExternalId: "-100123456789",
      targetType: "TG_CHANNEL",
      targetName: "My Channel",
      content: "hello world"
    });
    expect(result.author).toEqual({
      externalId: "123456",
      username: "johndoe",
      displayName: "John Doe"
    });
    expect(result.publishedAt).toEqual(new Date(1700000000 * 1000));
  });

  it("drops the author when the sender is missing", () => {
    const target = makeTarget();
    const message = makeMessage({ sender: undefined });

    const result = mapper.toNormalizedMessage(target, message, "x:1");

    expect(result.author).toBeUndefined();
  });

  it("falls back to an empty string for media-only messages", () => {
    const target = makeTarget();
    const message = makeMessage({ content: null });

    const result = mapper.toNormalizedMessage(target, message, "x:1");

    expect(result.content).toBe("");
  });

  it("builds externalId from chatId and message id", () => {
    expect(TelegramMapper.buildExternalId("-1001", 99)).toBe("-1001:99");
  });
});
