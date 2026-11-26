import "server-only";

type Payload = Record<string, unknown>;

function validPart(value: unknown): value is string {
  return typeof value === "string" &&
    value !== "." &&
    value !== ".." &&
    /^[A-Za-z0-9_.-]{1,100}$/.test(value);
}

async function githubWrite(path: string, body: Payload): Promise<unknown> {
  const token = process.env.GITHUB_WRITE_TOKEN;
  if (!token) throw new Error("GitHub write access is not configured.");

  const response = await fetch(`https://api.github.com${path}`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const raw = await response.text();
  if (raw.length > 256_000) throw new Error("GitHub returned an unexpectedly large response.");

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("GitHub returned an unreadable response.");
  }

  if (!response.ok) {
    const message = data && typeof data === "object" && typeof (data as Record<string, unknown>).message === "string"
      ? (data as Record<string, string>).message
      : "GitHub rejected the requested action.";
    throw new Error(message);
  }

  return data;
}

export function isSupportedGitHubAction(actionType: string): boolean {
  return ["github.create_branch", "github.create_issue", "github.create_pull_request"].includes(actionType);
}

export async function executeApprovedGitHubAction(
  actionType: string,
  payload: Payload,
): Promise<{ url: string | null; number: number | null; message: string }> {
  const owner = payload.owner;
  const repo = payload.repo;
  if (!validPart(owner) || !validPart(repo)) {
    throw new Error("A valid GitHub owner and repository are required.");
  }

  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  if (actionType === "github.create_branch") {
    const branch = payload.branch;
    const sha = payload.sha;
    if (
      typeof branch !== "string" ||
      !/^[A-Za-z0-9._/-]{1,180}$/.test(branch) ||
      branch.startsWith("/") ||
      branch.endsWith("/") ||
      branch.split("/").some((part) => !part || part === "." || part === "..") ||
      typeof sha !== "string" ||
      !/^[0-9a-f]{40}$/i.test(sha)
    ) {
      throw new Error("The branch name or source commit is invalid.");
    }

    const data = await githubWrite(`${base}/git/refs`, { ref: `refs/heads/${branch}`, sha }) as Record<string, unknown>;
    const object = data.object as Record<string, unknown> | undefined;
    return {
      url: `https://github.com/${owner}/${repo}/tree/${branch.split("/").map(encodeURIComponent).join("/")}`,
      number: null,
      message: `Created branch ${branch} at ${String(object?.sha ?? sha)}.`,
    };
  }

  if (actionType === "github.create_issue") {
    const title = payload.title;
    const body = payload.body;
    const labels = payload.labels;
    if (typeof title !== "string" || !title.trim() || title.length > 256) {
      throw new Error("The issue title is invalid.");
    }
    if (body !== undefined && (typeof body !== "string" || body.length > 60_000)) {
      throw new Error("The issue description is too long.");
    }
    if (labels !== undefined && (!Array.isArray(labels) || labels.length > 10 || labels.some((label) => typeof label !== "string" || label.length > 50))) {
      throw new Error("The issue labels are invalid.");
    }

    const data = await githubWrite(`${base}/issues`, {
      title: title.trim(),
      body: typeof body === "string" ? body : "",
      ...(Array.isArray(labels) ? { labels } : {}),
    }) as Record<string, unknown>;

    return {
      url: typeof data.html_url === "string" ? data.html_url : null,
      number: typeof data.number === "number" ? data.number : null,
      message: `Created GitHub issue #${String(data.number ?? "")}: ${title.trim()}.`,
    };
  }

  if (actionType === "github.create_pull_request") {
    const title = payload.title;
    const head = payload.head;
    const branch = payload.base;
    const body = payload.body;
    const draft = payload.draft === true;

    if (
      typeof title !== "string" || !title.trim() || title.length > 256 ||
      typeof head !== "string" || !/^[A-Za-z0-9_.\/-]{1,200}$/.test(head) ||
      typeof branch !== "string" || !/^[A-Za-z0-9_.\/-]{1,200}$/.test(branch) ||
      (body !== undefined && (typeof body !== "string" || body.length > 60_000))
    ) {
      throw new Error("The pull request details are invalid.");
    }

    const data = await githubWrite(`${base}/pulls`, {
      title: title.trim(),
      head,
      base: branch,
      body: typeof body === "string" ? body : "",
      draft,
    }) as Record<string, unknown>;

    return {
      url: typeof data.html_url === "string" ? data.html_url : null,
      number: typeof data.number === "number" ? data.number : null,
      message: `Created pull request #${String(data.number ?? "")}: ${title.trim()}.`,
    };
  }

  throw new Error("This GitHub action is not supported.");
}
