import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, Approval, Issue, IssueComment } from "@paperclipai/shared";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Inbox,
  Loader2,
  MessageSquareText,
  PlayCircle,
  Send,
  Sparkles,
  SquarePen,
} from "lucide-react";
import { agentsApi } from "../api/agents";
import { approvalsApi } from "../api/approvals";
import { heartbeatsApi } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import { StatusBadge } from "../components/StatusBadge";
import { PriorityIcon } from "../components/PriorityIcon";
import { MarkdownBody } from "../components/MarkdownBody";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl, cn, issueUrl, relativeTime } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ChatMessage = {
  id: string;
  author: "board";
  body: string;
  createdAt: string;
};

function commandDraftKey(companyId: string | null | undefined) {
  return `paperclip:command-center:${companyId ?? "none"}:messages`;
}

function commandThreadKey(companyId: string | null | undefined) {
  return `paperclip:command-center:${companyId ?? "none"}:thread`;
}

function loadMessages(companyId: string | null | undefined): ChatMessage[] {
  try {
    const raw = localStorage.getItem(commandDraftKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadThreadId(companyId: string | null | undefined) {
  try {
    return localStorage.getItem(commandThreadKey(companyId));
  } catch {
    return null;
  }
}

function isCeoAgent(agent: Agent) {
  const role = agent.role?.toLowerCase() ?? "";
  const name = agent.name?.toLowerCase() ?? "";
  const title = agent.title?.toLowerCase() ?? "";
  return role === "ceo" || name === "ceo" || title.includes("chief executive");
}

function shortText(value: string | null | undefined, fallback: string) {
  const text = value?.trim();
  if (!text) return fallback;
  return text.length > 170 ? `${text.slice(0, 167)}...` : text;
}

function approvalTitle(approval: Approval) {
  const payloadTitle = approval.payload?.title;
  const payloadName = approval.payload?.name;
  if (typeof payloadTitle === "string" && payloadTitle.trim()) return payloadTitle;
  if (typeof payloadName === "string" && payloadName.trim()) return payloadName;
  return approval.type.replace(/_/g, " ");
}

function approvalSummary(approval: Approval) {
  const summary = approval.payload?.summary ?? approval.payload?.description ?? approval.payload?.reason;
  return typeof summary === "string" ? summary : "Decision needed";
}

function buildIssueTitleFromMessage(body: string) {
  const firstLine = body.trim().split(/\n+/)[0]?.replace(/^[-*#\s]+/, "").trim();
  if (!firstLine) return "Follow up from CEO command chat";
  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine;
}

function ceoAdvisoryDescription() {
  return [
    "This is an ongoing general CEO advisory conversation, not an executable task.",
    "Reply conversationally as the company CEO. Use company context, current work, recent comments, approvals, and tasks where relevant.",
    "Answer the operator directly in your final response. Do not call Paperclip APIs to add issue comments, update this issue, post summaries, create follow-up tasks, or close this thread unless the operator explicitly asks.",
    "Do not say that you posted a summary. Do not repeat your answer in a separate wrap-up. One useful CEO reply is enough.",
    "Only turn the conversation into a work item when the operator explicitly asks for a task, issue, ticket, implementation, or follow-up action.",
  ].join("\n");
}

function isTaskStyleChatMetaComment(comment: IssueComment, ceo: Agent | null) {
  if (!ceo || comment.authorAgentId !== ceo.id) return false;
  const normalized = comment.body.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith("summary posted to ") ||
    normalized.startsWith("posted the advisory summary to ") ||
    normalized.includes("since this is a conversational advisory issue") ||
    (normalized.includes("summary") && normalized.includes("posted to") && /^.{0,80}jar-\d+/i.test(comment.body))
  );
}

function CommandMetric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  tone?: "default" | "danger" | "live";
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
          tone === "danger"
            ? "border-red-500/30 bg-red-500/10 text-red-500"
            : tone === "live"
              ? "border-blue-500/30 bg-blue-500/10 text-blue-500"
              : "border-border bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export function CommandCenter() {
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialog();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [messageBody, setMessageBody] = useState("");
  const [directTitle, setDirectTitle] = useState("");
  const [directDescription, setDirectDescription] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(selectedCompanyId));
  const [chatIssueId, setChatIssueId] = useState<string | null>(() => loadThreadId(selectedCompanyId));

  useEffect(() => {
    setMessages(loadMessages(selectedCompanyId));
    setChatIssueId(loadThreadId(selectedCompanyId));
    setMessageBody("");
    setDirectTitle("");
    setDirectDescription("");
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    localStorage.setItem(commandDraftKey(selectedCompanyId), JSON.stringify(messages));
  }, [messages, selectedCompanyId]);

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues = [] } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!, { includeRoutineExecutions: false, limit: 40 }),
    enabled: !!selectedCompanyId,
    refetchInterval: 20_000,
  });

  const { data: approvals = [] } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!, "pending"),
    queryFn: () => approvalsApi.list(selectedCompanyId!, "pending"),
    enabled: !!selectedCompanyId,
    refetchInterval: 20_000,
  });

  const { data: liveRuns = [] } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const {
    data: chatComments = [],
    isLoading: chatLoading,
    error: chatError,
  } = useQuery({
    queryKey: chatIssueId ? queryKeys.issues.comments(chatIssueId) : ["command-center", "no-chat-thread"],
    queryFn: () => issuesApi.listComments(chatIssueId!, { order: "asc", limit: 80 }),
    enabled: !!chatIssueId,
    refetchInterval: chatIssueId ? 5_000 : false,
  });

  const ceo = useMemo(
    () => agents.find((agent) => agent.status !== "terminated" && isCeoAgent(agent)) ?? null,
    [agents],
  );
  const openIssues = useMemo(
    () => issues.filter((issue) => !["done", "cancelled"].includes(issue.status)),
    [issues],
  );
  const blockedIssues = useMemo(() => issues.filter((issue) => issue.status === "blocked"), [issues]);
  const ceoIssues = useMemo(
    () => ceo ? issues.filter((issue) => issue.assigneeAgentId === ceo.id && !["done", "cancelled"].includes(issue.status)) : [],
    [ceo, issues],
  );
  const latestBoardMessage = useMemo(
    () => [...messages].reverse().find((message) => message.author === "board") ?? null,
    [messages],
  );
  const visibleChatComments = useMemo(
    () => chatComments.filter((comment) => !isTaskStyleChatMetaComment(comment, ceo)),
    [ceo, chatComments],
  );
  const latestChatComment = visibleChatComments.at(-1) ?? null;

  const createIssue = useMutation({
    mutationFn: async (input: { title: string; description?: string }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return issuesApi.create(selectedCompanyId, {
        title: input.title,
        description: input.description || undefined,
        priority: "medium",
        status: "todo",
        ...(ceo ? { assigneeAgentId: ceo.id } : {}),
      });
    },
    onSuccess: (issue) => {
      if (!selectedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId) });
      pushToast({
        title: `Created ${issue.identifier ?? "issue"}`,
        body: ceo ? `Assigned to ${ceo.name}.` : "No CEO agent was found, so it is unassigned.",
        action: { label: "Open", href: issueUrl(issue) },
      });
      setDirectTitle("");
      setDirectDescription("");
    },
  });

  const sendChatMessage = useMutation({
    mutationFn: async (body: string) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      if (!ceo) throw new Error("No CEO agent found");
      let issueId = chatIssueId;
      if (!issueId) {
        const issue = await issuesApi.create(selectedCompanyId, {
          title: `CEO advisory chat: ${buildIssueTitleFromMessage(body)}`,
          description: ceoAdvisoryDescription(),
          priority: "medium",
          status: "todo",
          assigneeAgentId: ceo.id,
        });
        issueId = issue.id;
        await issuesApi.update(issue.id, { hiddenAt: new Date().toISOString() });
      } else {
        await issuesApi.update(issueId, {
          description: ceoAdvisoryDescription(),
          assigneeAgentId: ceo.id,
          hiddenAt: new Date().toISOString(),
        });
      }
      const comment = await issuesApi.addComment(issueId, body);
      return { issueId, comment };
    },
    onSuccess: ({ issueId }) => {
      if (!selectedCompanyId) return;
      setChatIssueId(issueId);
      localStorage.setItem(commandThreadKey(selectedCompanyId), issueId);
      setMessageBody("");
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId) });
      pushToast({
        title: "Sent to CEO",
        body: "The CEO has been woken for this conversation.",
      });
    },
    onError: (err) => {
      pushToast({
        title: "CEO chat failed",
        body: err instanceof Error ? err.message : "Unable to send message to the CEO.",
        tone: "error",
      });
    },
  });

  function addBoardMessage() {
    const body = messageBody.trim();
    if (!body) return;
    sendChatMessage.mutate(body);
  }

  function openIssueDialogFromMessage(message: ChatMessage | null) {
    const body = message?.body.trim() || messageBody.trim();
    openNewIssue({
      title: buildIssueTitleFromMessage(body),
      description: body ? `Source: CEO command chat\n\n${body}` : "",
      assigneeAgentId: ceo?.id,
      status: "todo",
      priority: "medium",
    });
  }

  function handleDirectCreate() {
    const title = directTitle.trim();
    if (!title) return;
    createIssue.mutate({
      title,
      description: directDescription.trim()
        ? `Source: Mobile command inbox\n\n${directDescription.trim()}`
        : undefined,
    });
  }

  function clearConversation() {
    setMessages([]);
    if (selectedCompanyId) localStorage.removeItem(commandDraftKey(selectedCompanyId));
  }

  function resetChatThread() {
    setChatIssueId(null);
    if (selectedCompanyId) localStorage.removeItem(commandThreadKey(selectedCompanyId));
    setMessages([]);
    if (selectedCompanyId) localStorage.removeItem(commandDraftKey(selectedCompanyId));
  }

  if (!selectedCompanyId) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
        <MessageSquareText className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">Select a company</h1>
        <p className="text-sm text-muted-foreground">Choose a company before using the CEO command surface.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Board command
          </div>
          <h1 className="mt-1 text-xl font-bold">CEO Command</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Chat with the CEO first, then promote the useful parts into executable work.
          </p>
        </div>
        {ceo ? (
          <Link to={agentUrl(ceo)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
            <Bot className="h-4 w-4" />
            <span className="truncate">{ceo.name}</span>
            <StatusBadge status={ceo.status} />
          </Link>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-4 w-4" />
            No CEO agent found
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CommandMetric icon={Inbox} label="Open tasks" value={openIssues.length} />
        <CommandMetric icon={ClipboardCheck} label="Pending approvals" value={approvals.length} tone={approvals.length > 0 ? "danger" : "default"} />
        <CommandMetric icon={PlayCircle} label="Live runs" value={liveRuns.length} tone={liveRuns.length > 0 ? "live" : "default"} />
        <CommandMetric icon={AlertCircle} label="Blocked tasks" value={blockedIssues.length} tone={blockedIssues.length > 0 ? "danger" : "default"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <section className="flex min-h-[560px] flex-col rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">CEO chat</h2>
              <p className="text-xs text-muted-foreground">A lightweight conversation thread. Make a task only when you choose.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={resetChatThread} disabled={!chatIssueId && messages.length === 0}>
              New chat
            </Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {chatError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                CEO chat thread could not be loaded. Start a new chat or open the existing task list.
              </div>
            ) : chatLoading ? (
              <div className="flex h-full min-h-60 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading CEO chat...
              </div>
            ) : visibleChatComments.length === 0 ? (
              <div className="flex h-full min-h-60 flex-col items-center justify-center rounded-md border border-dashed border-border p-6 text-center">
                <MessageSquareText className="h-8 w-8 text-muted-foreground" />
                <h3 className="mt-3 text-sm font-semibold">Ask the CEO anything</h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Send strategy, questions, context, or messy thoughts here. The CEO can reply without you turning it into a task first.
                </p>
              </div>
            ) : (
              visibleChatComments.map((comment) => (
                <ChatBubble key={comment.id} comment={comment} ceo={ceo} />
              ))
            )}
            {sendChatMessage.isPending && (
              <div className="ml-auto max-w-[85%] rounded-lg border border-primary/30 bg-primary/10 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending...
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6">{messageBody.trim()}</p>
              </div>
            )}
            {latestChatComment?.authorUserId && !sendChatMessage.isPending && (
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Waiting for the CEO to reply. This panel refreshes automatically.
              </div>
            )}
            {messages.length > 0 && visibleChatComments.length === 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                Older scratchpad notes are still stored locally. Use “Turn into task” below if you want to promote the latest note.
              </div>
            )}
            {messages.length > 0 && visibleChatComments.length === 0 && (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Bot className="h-3.5 w-3.5" />
                      Saved note
                      <span>{relativeTime(message.createdAt)}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openIssueDialogFromMessage(message)}>
                      <SquarePen className="mr-1.5 h-3.5 w-3.5" />
                      Make task
                    </Button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <Textarea
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              placeholder="Talk through what is going on, what you are considering, or what the CEO should help turn into work..."
              className="min-h-28 resize-none"
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  addBoardMessage();
                }
              }}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Cmd/Ctrl + Enter sends to the CEO. Tasks are created only when you choose.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => openIssueDialogFromMessage(latestBoardMessage)} disabled={!latestBoardMessage && !messageBody.trim()}>
                  <SquarePen className="mr-1.5 h-4 w-4" />
                  Turn into task
                </Button>
                <Button onClick={addBoardMessage} disabled={!messageBody.trim() || !ceo || sendChatMessage.isPending}>
                  {sendChatMessage.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  Send to CEO
                </Button>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <SquarePen className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Direct task</h2>
            </div>
            <div className="space-y-3">
              <Input value={directTitle} onChange={(event) => setDirectTitle(event.target.value)} placeholder="What needs doing?" />
              <Textarea
                value={directDescription}
                onChange={(event) => setDirectDescription(event.target.value)}
                placeholder="Context, constraints, or the outcome you want."
                className="min-h-28 resize-none"
              />
              <Button className="w-full" onClick={handleDirectCreate} disabled={!directTitle.trim() || createIssue.isPending}>
                {createIssue.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                Create for CEO
              </Button>
            </div>
          </section>

          <CommandList title="CEO work" icon={Bot} empty="No open CEO tasks." items={ceoIssues} />
          <ApprovalList approvals={approvals} />
          <CommandList title="Blocked" icon={AlertCircle} empty="No blocked tasks." items={blockedIssues} />
        </aside>
      </div>
    </div>
  );
}

function ChatBubble({ comment, ceo }: { comment: IssueComment; ceo: Agent | null }) {
  const isCeo = !!ceo && comment.authorAgentId === ceo.id;
  const isBoard = !!comment.authorUserId && !comment.authorAgentId;
  const author = isCeo ? ceo.name : isBoard ? "You" : "System";
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        isBoard
          ? "ml-auto max-w-[85%] border-primary/30 bg-primary/10"
          : "mr-auto max-w-[96%] border-border bg-background",
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {isCeo ? <Bot className="h-3.5 w-3.5" /> : <MessageSquareText className="h-3.5 w-3.5" />}
        <span>{author}</span>
        <span>{relativeTime(comment.createdAt)}</span>
      </div>
      <MarkdownBody className="text-sm leading-6 prose-headings:mb-2 prose-headings:mt-4 prose-h2:text-base prose-h3:text-sm prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        {comment.body}
      </MarkdownBody>
    </div>
  );
}

function CommandList({
  title,
  icon: Icon,
  empty,
  items,
}: {
  title: string;
  icon: typeof Bot;
  empty: string;
  items: Issue[];
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 ? (
          <div className="px-4 py-5 text-sm text-muted-foreground">{empty}</div>
        ) : (
          items.slice(0, 5).map((issue) => (
            <Link key={issue.id} to={issueUrl(issue)} className="block px-4 py-3 hover:bg-accent/50">
              <div className="flex min-w-0 items-center gap-2">
                <CircleDot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{issue.identifier ?? issue.title}</span>
                <StatusBadge status={issue.status} />
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <PriorityIcon priority={issue.priority} />
                <span className="truncate">{shortText(issue.title, "Untitled task")}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function ApprovalList({ approvals }: { approvals: Approval[] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Approvals</h2>
        <span className="ml-auto text-xs text-muted-foreground">{approvals.length}</span>
      </div>
      <div className="divide-y divide-border">
        {approvals.length === 0 ? (
          <div className="px-4 py-5 text-sm text-muted-foreground">No pending approvals.</div>
        ) : (
          approvals.slice(0, 5).map((approval) => (
            <Link key={approval.id} to={`/approvals/${approval.id}`} className="block px-4 py-3 hover:bg-accent/50">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{shortText(approvalTitle(approval), approval.type)}</span>
                <StatusBadge status={approval.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{shortText(approvalSummary(approval), "Decision needed")}</p>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
