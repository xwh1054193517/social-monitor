import { ConflictException } from "@nestjs/common";
import { EncryptionService } from "../crypto/encryption.service";
import { TelegramAccountRepository } from "./telegram-account.repository";
import { TelegramClientManager } from "./telegram-client-manager.service";
import { TelegramListener } from "./telegram-listener";
import { TelegramService } from "./telegram.service";

describe("TelegramService", () => {
  let service: TelegramService;
  let clients: {
    getStatus: jest.Mock;
    fetchDialogs: jest.Mock;
    fetchChannels: jest.Mock;
    fetchGroups: jest.Mock;
    connectWithSession: jest.Mock;
    disconnect: jest.Mock;
  };
  let accounts: { findConnected: jest.Mock; update: jest.Mock };
  let encryption: { decrypt: jest.Mock };
  let listener: { startFor: jest.Mock };

  beforeEach(() => {
    clients = {
      getStatus: jest.fn(),
      fetchDialogs: jest.fn(),
      fetchChannels: jest.fn(),
      fetchGroups: jest.fn(),
      connectWithSession: jest.fn(),
      disconnect: jest.fn()
    };
    accounts = { findConnected: jest.fn(), update: jest.fn() };
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
    clients.getStatus.mockResolvedValue({ phone: null, connected: false });

    const result = await service.getStatus();

    expect(result).toEqual({ data: { connected: false, phone: null } });
  });

  it("reports connected with the current phone", async () => {
    clients.getStatus.mockResolvedValue({
      phone: "13800000000",
      connected: true
    });

    const result = await service.getStatus();

    expect(result).toEqual({
      data: { connected: true, phone: "13800000000" }
    });
  });

  it("throws when listing dialogs without an active session", async () => {
    clients.getStatus.mockResolvedValue({ phone: null, connected: false });

    await expect(service.getDialogs()).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it("returns dialogs fetched from the sidecar", async () => {
    clients.getStatus.mockResolvedValue({
      phone: "13800000000",
      connected: true
    });
    clients.fetchDialogs.mockResolvedValue([
      { id: "-1001", title: "Channel Title", username: "chan", type: "channel" }
    ]);

    const result = await service.getDialogs();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "-1001", type: "channel" });
  });

  it("returns channels fetched from the sidecar", async () => {
    clients.getStatus.mockResolvedValue({
      phone: "13800000000",
      connected: true
    });
    clients.fetchChannels.mockResolvedValue([
      { id: "-1001", title: "Channel Title", username: "chan", type: "channel" }
    ]);

    const result = await service.getChannels();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "-1001", type: "channel" });
  });

  it("returns groups fetched from the sidecar", async () => {
    clients.getStatus.mockResolvedValue({
      phone: "13800000000",
      connected: true
    });
    clients.fetchGroups.mockResolvedValue([
      { id: "-1002", title: "Megagroup", username: "mega", type: "megagroup" }
    ]);

    const result = await service.getGroups();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ type: "megagroup" });
  });

  it("reconnects using the stored encrypted session", async () => {
    accounts.findConnected.mockResolvedValue([
      { phone: "13800000000", session: "encrypted-session" }
    ]);
    clients.connectWithSession.mockResolvedValue(undefined);

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

  it("disconnects the sidecar client and clears the session on logout", async () => {
    accounts.findConnected.mockResolvedValue([
      { id: "a_1", phone: "13800000000", session: "encrypted-session" }
    ]);
    clients.disconnect.mockResolvedValue(undefined);
    accounts.update.mockResolvedValue(undefined);

    const result = await service.logout();

    expect(clients.disconnect).toHaveBeenCalledWith("13800000000");
    expect(accounts.update).toHaveBeenCalledWith("a_1", {
      connected: false,
      session: ""
    });
    expect(result).toEqual({
      data: { disconnected: true, phone: "13800000000" }
    });
  });
});
