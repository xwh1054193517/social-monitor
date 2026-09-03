import { ConflictException } from "@nestjs/common";
import { Api } from "telegram";
import { EncryptionService } from "../crypto/encryption.service";
import { TelegramAccountRepository } from "./telegram-account.repository";
import { TelegramClientManager } from "./telegram-client-manager.service";
import { TelegramListener } from "./telegram-listener";
import { TelegramService } from "./telegram.service";

function makeChannel(overrides: Record<string, unknown> = {}): Api.Channel {
  const channel = Object.create(Api.Channel.prototype) as Api.Channel;
  channel.id = { toString: () => "-1001" } as never;
  channel.title = "Channel Title";
  channel.username = "chan";
  channel.megagroup = false;
  Object.assign(channel, overrides);
  return channel;
}

function makeDialog(
  entity: Api.User | Api.Chat | Api.Channel,
  flags: { isChannel?: boolean; isGroup?: boolean } = {}
) {
  return {
    id: { toString: () => (entity as { id?: { toString(): string } }).id?.toString() ?? "0" },
    title: (entity as { title?: string }).title ?? "Title",
    entity,
    ...flags
  };
}

describe("TelegramService", () => {
  let service: TelegramService;
  let clients: {
    getCurrentPhone: jest.Mock;
    isConnected: jest.Mock;
    getActiveClient: jest.Mock;
    connectWithSession: jest.Mock;
  };
  let accounts: { findConnected: jest.Mock };
  let encryption: { decrypt: jest.Mock };
  let listener: { startFor: jest.Mock };

  beforeEach(() => {
    clients = {
      getCurrentPhone: jest.fn(),
      isConnected: jest.fn(),
      getActiveClient: jest.fn(),
      connectWithSession: jest.fn()
    };
    accounts = { findConnected: jest.fn() };
    encryption = { decrypt: jest.fn((v) => `dec:${v}`) };
    listener = { startFor: jest.fn() };

    service = new TelegramService(
      clients as unknown as TelegramClientManager,
      accounts as unknown as TelegramAccountRepository,
      encryption as unknown as EncryptionService,
      listener as unknown as TelegramListener
    );
  });

  it("reports disconnected when no account is active", async () => {
    clients.getCurrentPhone.mockReturnValue(null);

    const result = await service.getStatus();

    expect(result).toEqual({ data: { connected: false, phone: null } });
  });

  it("reports connected with the current phone", async () => {
    clients.getCurrentPhone.mockReturnValue("13800000000");
    clients.isConnected.mockReturnValue(true);

    const result = await service.getStatus();

    expect(result).toEqual({
      data: { connected: true, phone: "13800000000" }
    });
  });

  it("throws when listing dialogs without an active client", async () => {
    clients.getActiveClient.mockReturnValue(null);

    await expect(service.getDialogs()).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it("filters channels from dialogs", async () => {
    const channel = makeChannel();
    const megagroup = makeChannel({
      megagroup: true,
      title: "Megagroup",
      username: "mega"
    });
    const client = {
      getDialogs: jest.fn().mockResolvedValue([
        makeDialog(channel, { isChannel: true }),
        makeDialog(megagroup, { isChannel: true })
      ])
    };
    clients.getActiveClient.mockReturnValue(client);

    const result = await service.getChannels();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "-1001", type: "channel" });
  });

  it("includes megagroups in groups", async () => {
    const channel = makeChannel();
    const megagroup = makeChannel({
      megagroup: true,
      title: "Megagroup",
      username: "mega"
    });
    const client = {
      getDialogs: jest.fn().mockResolvedValue([
        makeDialog(channel, { isChannel: true }),
        makeDialog(megagroup, { isChannel: true })
      ])
    };
    clients.getActiveClient.mockReturnValue(client);

    const result = await service.getGroups();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ type: "megagroup" });
  });

  it("reconnects using the stored encrypted session", async () => {
    accounts.findConnected.mockResolvedValue([
      { phone: "13800000000", session: "encrypted-session" }
    ]);
    clients.connectWithSession.mockResolvedValue({ connected: true });

    const result = await service.reconnect();

    expect(encryption.decrypt).toHaveBeenCalledWith("encrypted-session");
    expect(clients.connectWithSession).toHaveBeenCalledWith(
      "13800000000",
      "dec:encrypted-session"
    );
    expect(listener.startFor).toHaveBeenCalledWith("13800000000");
    expect(result).toEqual({
      data: { connected: true, phone: "13800000000" }
    });
  });

  it("throws when there is no account to reconnect", async () => {
    accounts.findConnected.mockResolvedValue([]);

    await expect(service.reconnect()).rejects.toBeInstanceOf(ConflictException);
  });
});
