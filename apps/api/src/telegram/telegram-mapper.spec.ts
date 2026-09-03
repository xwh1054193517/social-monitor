import { MonitorTarget } from "@prisma/client";
import { Api } from "telegram";
import { TelegramMapper } from "./telegram-mapper";

function makeUser(overrides: Record<string, unknown> = {}): Api.User {
  const user = Object.create(Api.User.prototype) as Api.User;
  user.id = { toString: () => "123456" } as never;
  user.firstName = "John";
  user.lastName = "Doe";
  user.username = "johndoe";
  Object.assign(user, overrides);
  return user;
}

function makeTarget(): MonitorTarget {
  return {
    id: "t_1",
    type: "TG_CHANNEL",
    name: "My Channel",
    externalId: "-100123456789"
  } as MonitorTarget;
}

function makeMessage(overrides: Record<string, unknown> = {}): Api.Message {
  return {
    message: "hello world",
    chatId: { toString: () => "-100123456789" },
    date: 1700000000,
    id: 42,
    sender: makeUser(),
    ...overrides
  } as unknown as Api.Message;
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

  it("drops the author when the sender is not a User", () => {
    const target = makeTarget();
    const message = makeMessage({ sender: undefined });

    const result = mapper.toNormalizedMessage(target, message, "x:1");

    expect(result.author).toBeUndefined();
  });

  it("falls back to an empty string for media-only messages", () => {
    const target = makeTarget();
    const message = makeMessage({ message: undefined });

    const result = mapper.toNormalizedMessage(target, message, "x:1");

    expect(result.content).toBe("");
  });

  it("builds externalId from chatId and message id", () => {
    expect(TelegramMapper.buildExternalId("-1001", 99)).toBe("-1001:99");
  });
});
