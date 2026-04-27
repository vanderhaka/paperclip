import { describe, expect, it } from "vitest";
import { REDACTED, redactCliSecrets } from "../commands/client/redaction.js";

describe("client redaction", () => {
  it("redacts secret-like keys and values by default", () => {
    const value = redactCliSecrets({
      id: "agent-1",
      name: "Gateway",
      adapterConfig: {
        headers: {
          "x-openclaw-token": "pcp_super_secret_token",
        },
        privatePem: "-----BEGIN TEST FIXTURE-----\nabc\n-----END TEST FIXTURE-----",
        nested: {
          bearer: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
        },
      },
    });

    expect(value).toEqual({
      id: "agent-1",
      name: "Gateway",
      adapterConfig: {
        headers: {
          "x-openclaw-token": REDACTED,
        },
        privatePem: REDACTED,
        nested: {
          bearer: REDACTED,
        },
      },
    });
  });

  it("preserves the original value when secret display is explicitly requested", () => {
    const original = {
      adapterConfig: Object.fromEntries([["apiKey", "demo-value"]]),
    };

    expect(redactCliSecrets(original, { showSecrets: true })).toBe(original);
  });
});
