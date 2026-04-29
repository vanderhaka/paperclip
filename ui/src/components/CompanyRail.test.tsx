// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Company } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompanyRail } from "./CompanyRail";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const navigateMock = vi.hoisted(() => vi.fn());
const openOnboardingMock = vi.hoisted(() => vi.fn());
const setSelectedCompanyIdMock = vi.hoisted(() => vi.fn());

const companyState = vi.hoisted(() => ({
  companies: [] as Company[],
  selectedCompanyId: "company-a",
  setSelectedCompanyId: setSelectedCompanyIdMock,
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => companyState,
}));

vi.mock("../context/DialogContext", () => ({
  useDialog: () => ({ openOnboarding: openOnboardingMock }),
}));

vi.mock("@/lib/router", () => ({
  useLocation: () => ({ pathname: "/A/dashboard" }),
  useNavigate: () => navigateMock,
}));

vi.mock("../api/sidebarBadges", () => ({
  sidebarBadgesApi: {
    get: vi.fn().mockResolvedValue({ inbox: 0 }),
  },
}));

vi.mock("../api/heartbeats", () => ({
  heartbeatsApi: {
    liveRunsForCompany: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("./CompanyPatternIcon", () => ({
  CompanyPatternIcon: ({ companyName }: { companyName: string }) => (
    <span data-testid="company-pattern-icon">{companyName.slice(0, 1)}</span>
  ),
}));

function createCompany(overrides: Partial<Company>): Company {
  return {
    id: "company-a",
    name: "Alpha",
    description: null,
    status: "active",
    pauseReason: null,
    pausedAt: null,
    issuePrefix: "A",
    issueCounter: 1,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    requireBoardApprovalForNewAgents: false,
    agentHiringPolicy: null,
    feedbackDataSharingEnabled: false,
    feedbackDataSharingConsentAt: null,
    feedbackDataSharingConsentByUserId: null,
    feedbackDataSharingTermsVersion: null,
    brandColor: null,
    logoAssetId: null,
    logoUrl: null,
    createdAt: new Date("2026-04-28T00:00:00.000Z"),
    updatedAt: new Date("2026-04-28T00:00:00.000Z"),
    ...overrides,
  };
}

describe("CompanyRail", () => {
  let container: HTMLDivElement;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    navigateMock.mockReset();
    openOnboardingMock.mockReset();
    setSelectedCompanyIdMock.mockReset();
    window.localStorage.clear();
    companyState.selectedCompanyId = "company-a";
    companyState.companies = [
      createCompany({ id: "company-a", name: "Alpha", issuePrefix: "A", brandColor: "#d95f76" }),
      createCompany({ id: "company-j", name: "JARVE", issuePrefix: "JAR", brandColor: "#9b5fd9" }),
    ];
  });

  afterEach(() => {
    queryClient.clear();
    container.remove();
  });

  it("navigates to the selected company's dashboard when clicking a rail avatar", async () => {
    await act(async () => {
      createRoot(container).render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <CompanyRail />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });

    const jarveLink = container.querySelector('a[href="/JAR/dashboard"]') as HTMLAnchorElement | null;
    expect(jarveLink).not.toBeNull();

    await act(async () => {
      jarveLink!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(setSelectedCompanyIdMock).toHaveBeenCalledWith("company-j");
    expect(navigateMock).toHaveBeenCalledWith("/JAR/dashboard");
  });
});
