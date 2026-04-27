import { describe, expect, it } from "vitest";
import {
  normalizeMaxConcurrentRuns,
  normalizeWakeOnDemand,
  shouldEnforceWakeOnDemandPolicy,
} from "../services/heartbeat.ts";

const HEARTBEAT_MAX_CONCURRENT_RUNS_DEFAULT = 1;
const HEARTBEAT_MAX_CONCURRENT_RUNS_MAX = 10;

describe("heartbeat policy", () => {
  it("preserves configured concurrency below the default", () => {
    expect(normalizeMaxConcurrentRuns(1)).toBe(1);
    expect(normalizeMaxConcurrentRuns(2)).toBe(2);
  });

  it("uses the default only when the configured value is missing or invalid", () => {
    expect(normalizeMaxConcurrentRuns(undefined)).toBe(HEARTBEAT_MAX_CONCURRENT_RUNS_DEFAULT);
    expect(normalizeMaxConcurrentRuns("nope")).toBe(HEARTBEAT_MAX_CONCURRENT_RUNS_DEFAULT);
  });

  it("clamps configured concurrency to documented bounds", () => {
    expect(normalizeMaxConcurrentRuns(0)).toBe(1);
    expect(normalizeMaxConcurrentRuns(-5)).toBe(1);
    expect(normalizeMaxConcurrentRuns(HEARTBEAT_MAX_CONCURRENT_RUNS_MAX + 1)).toBe(HEARTBEAT_MAX_CONCURRENT_RUNS_MAX);
  });

  it("preserves demand wakes for legacy or missing heartbeat config", () => {
    expect(normalizeWakeOnDemand(undefined)).toBe(true);
    expect(normalizeWakeOnDemand({})).toBe(true);
  });

  it("preserves explicit and legacy demand wake settings", () => {
    expect(normalizeWakeOnDemand({ wakeOnDemand: true })).toBe(true);
    expect(normalizeWakeOnDemand({ wakeOnDemand: false })).toBe(false);
    expect(normalizeWakeOnDemand({ wakeOnAssignment: true })).toBe(true);
    expect(normalizeWakeOnDemand({ wakeOnOnDemand: true })).toBe(true);
    expect(normalizeWakeOnDemand({ wakeOnAutomation: true })).toBe(true);
  });

  it("does not require wakeOnDemand for manual on-demand invocations", () => {
    expect(shouldEnforceWakeOnDemandPolicy("on_demand")).toBe(false);
    expect(shouldEnforceWakeOnDemandPolicy("timer")).toBe(false);
    expect(shouldEnforceWakeOnDemandPolicy("assignment")).toBe(true);
    expect(shouldEnforceWakeOnDemandPolicy("automation")).toBe(true);
  });
});
