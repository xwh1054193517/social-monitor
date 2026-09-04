import { BadRequestException } from "@nestjs/common";
import { EncryptionService } from "../crypto/encryption.service";
import { TelegramAccountRepository } from "./telegram-account.repository";
import { TelegramAuthService } from "./telegram-auth.service";
import { TelegramClientManager } from "./telegram-client-manager.service";
import { TelegramListener } from "./telegram-listener";

describe("TelegramAuthService", () => {
  let service: TelegramAuthService;
  let clients: {
    sendCode: jest.Mock;
    submitCode: jest.Mock;
    submitPassword: jest.Mock;
    saveSession: jest.Mock;
  };
  let accounts: { upsert: jest.Mock };
  let encryption: { encrypt: jest.Mock };
  let listener: { startFor: jest.Mock };

  beforeEach(() => {
    clients = {
      sendCode: jest.fn(),
      submitCode: jest.fn(),
      submitPassword: jest.fn(),
      saveSession: jest.fn()
    };
    accounts = { upsert: jest.fn() };
    encryption = { encrypt: jest.fn((v) => `enc:${v}`) };
    listener = { startFor: jest.fn() };

    service = new TelegramAuthService(
      clients as unknown as TelegramClientManager,
      accounts as unknown as TelegramAccountRepository,
      encryption as unknown as EncryptionService,
      listener as unknown as TelegramListener
    );
  });

  it("normalizes the phone and starts the code flow", async () => {
    clients.sendCode.mockResolvedValue({
      phoneCodeHash: "hash",
      isCodeViaApp: false
    });

    const result = await service.startLogin({ phone: " +86 138-0000-0000 " });

    expect(clients.sendCode).toHaveBeenCalledWith("+8613800000000");
    expect(result).toEqual({
      data: { phone: "+8613800000000", phoneCodeHash: "hash", isCodeViaApp: false }
    });
  });

  it("persists the session after a successful code submit", async () => {
    clients.submitCode.mockResolvedValue({ passwordRequired: false });
    clients.saveSession.mockResolvedValue("saved-session");

    const result = await service.submitCode({ phone: "13800000000", code: "12345" });

    expect(clients.saveSession).toHaveBeenCalledWith("13800000000");
    expect(encryption.encrypt).toHaveBeenCalledWith("saved-session");
    expect(accounts.upsert).toHaveBeenCalledWith(
      "13800000000",
      "enc:saved-session",
      true
    );
    expect(listener.startFor).toHaveBeenCalledWith("13800000000");
    expect(result).toEqual({
      data: { phone: "13800000000", connected: true }
    });
  });

  it("returns passwordRequired when the account has 2FA", async () => {
    clients.submitCode.mockResolvedValue({ passwordRequired: true });

    const result = await service.submitCode({ phone: "13800000000", code: "1" });

    expect(accounts.upsert).not.toHaveBeenCalled();
    expect(clients.saveSession).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: { phone: "13800000000", passwordRequired: true }
    });
  });

  it("persists the session after a successful password submit", async () => {
    clients.submitPassword.mockResolvedValue(undefined);
    clients.saveSession.mockResolvedValue("pw-session");

    const result = await service.submitPassword({
      phone: "13800000000",
      password: "secret"
    });

    expect(clients.submitPassword).toHaveBeenCalledWith(
      "13800000000",
      "secret"
    );
    expect(accounts.upsert).toHaveBeenCalledWith(
      "13800000000",
      "enc:pw-session",
      true
    );
    expect(result).toEqual({
      data: { phone: "13800000000", connected: true }
    });
  });

  it("wraps auth errors into a BadRequestException", async () => {
    clients.sendCode.mockRejectedValue(new Error("PHONE_NUMBER_INVALID"));

    await expect(
      service.startLogin({ phone: "123" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
