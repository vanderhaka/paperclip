export const REDACTED = "[REDACTED]";

const SECRET_KEY_TERMS = [
  "token",
  "key",
  "secret",
  "pem",
  "password",
  "credential",
  "auth",
];

const SECRET_VALUE_PATTERNS = [
  /-----BEGIN /,
  /-----END /,
  /\bpcp_[A-Za-z0-9_-]{8,}\b/,
  /^sk-[A-Za-z0-9_-]{8,}$/,
  /^[A-Fa-f0-9]{32,}$/,
  /^[A-Za-z0-9+/_-]{40,}={0,2}$/,
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
];

function keyIsSecret(key: string) {
  const lower = key.toLowerCase();
  return SECRET_KEY_TERMS.some((term) => lower.includes(term));
}

function stringLooksSecret(value: string) {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return stringLooksSecret(value) ? REDACTED : value;
  }
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = keyIsSecret(key) ? REDACTED : redactValue(child, seen);
  }
  return output;
}

export function redactCliSecrets<T>(value: T, opts: { showSecrets?: boolean } = {}): T {
  if (opts.showSecrets) return value;
  return redactValue(value, new WeakSet()) as T;
}
