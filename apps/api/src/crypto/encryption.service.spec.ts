import { EncryptionService } from "./encryption.service";

const KEY = "a".repeat(64);

describe("EncryptionService", () => {
  let service: EncryptionService;

  beforeEach(() => {
    service = new EncryptionService(KEY);
  });

  it("rejects a missing or short key", () => {
    expect(() => new EncryptionService("")).toThrow();
    expect(() => new EncryptionService("short")).toThrow();
    expect(() => new EncryptionService("a".repeat(63))).toThrow();
  });

  it("encrypts then decrypts back to the original plaintext", () => {
    const plaintext = "a secret telegram session string";
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(service.encrypt("same")).not.toBe(service.encrypt("same"));
  });

  it("handles unicode content", () => {
    const plaintext = "中文内容 🎉 with emoji";
    expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
  });

  it("throws on a tampered payload", () => {
    const encrypted = service.encrypt("secret");
    const parts = encrypted.split(".");
    const tampered = ["AAAA".repeat(3), parts[1], parts[2]].join(".");
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it("throws on a malformed payload", () => {
    expect(() => service.decrypt("only-two.parts")).toThrow();
  });
});
