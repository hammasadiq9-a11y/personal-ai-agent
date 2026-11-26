import "server-only";

type GitHubArgs = Record<string, unknown>;

function validateRepoPart(value: unknown): value is string {
  return typeof value === "string" && value !== "." && value !== ".." && /^[A-Za-z0-9_.-]{1,100}$/.test(value);
}

async function githubGet(path: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { error: "GitHub is not connected. Add a read-only GITHUB_TOKEN in the server environment." };
  }

  const response = await fetch(`https://api.github.com${path}`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  const raw = await response.text();
  if (raw.length > 1_000_000) {
    return { error: "GitHub returned too much data. Narrow the request." };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: "GitHub returned an unreadable response." };
  }

  if (!response.ok) {
    const message = data && typeof data === "object" && typeof (data as Record<string, unknown>).message === "string"
      ? (data as Record<string, string>).message
      : "GitHub request failed.";
    return { error: message, status: response.status };
  }

  return data;
}

function getRepoArgs(args: GitHubArgs) {
  if (!validateRepoPart(args.owner) || !validateRepoPart(args.repo)) {
    return null;
  }
  return { owner: args.owner, repo: args.repo };
}

export async function runGitHubTool(name: string, args: GitHubArgs): Promise<unknown> {
  if (name === "github_list_my_repositories") {
    const data = await githubGet("/user/repos?sort=updated&per_page=20");
    if (!Array.isArray(data)) return data;
    return data.map((repo) => {
      const item = repo as Record<string, unknown>;
      return {
        full_name: item.full_name,
        description: item.description,
        private: item.private,
        html_url: item.html_url,
        default_branch: item.default_branch,
        updated_at: item.updated_at,
      };
    });
  }

  const repository = getRepoArgs(args);
  if (!repository) return { error: "A valid repository owner and name are required." };
  const base = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;

  if (name === "github_get_branch") {
    if (typeof args.branch !== "string" || !args.branch.trim() || args.branch.length > 180) {
      return { error: "A valid branch name is required." };
    }
    const branchPath = args.branch.split("/").map(encodeURIComponent).join("/");
    const data = await githubGet(`${base}/branches/${branchPath}`);
    if (!data || typeof data !== "object") return data;
    const item = data as Record<string, unknown>;
    const commit = item.commit as Record<string, unknown> | undefined;
    return {
      name: item.name,
      protected: item.protected,
      commit_sha: commit?.sha,
      commit_url: commit?.html_url,
    };
  }

  if (name === "github_get_repository") {
    const data = await githubGet(base);
    if (!data || typeof data !== "object") return data;
    const item = data as Record<string, unknown>;
    return {
      full_name: item.full_name,
      description: item.description,
      private: item.private,
      html_url: item.html_url,
      default_branch: item.default_branch,
      language: item.language,
      open_issues_count: item.open_issues_count,
      updated_at: item.updated_at,
    };
  }

  if (name === "github_list_issues") {
    const state = ["open", "closed", "all"].includes(String(args.state)) ? String(args.state) : "open";
    const data = await githubGet(`${base}/issues?state=${state}&per_page=20`);
    if (!Array.isArray(data)) return data;
    return data
      .filter((issue) => !(issue as Record<string, unknown>).pull_request)
      .map((issue) => {
        const item = issue as Record<string, unknown>;
        return {
          number: item.number,
          title: item.title,
          state: item.state,
          html_url: item.html_url,
          updated_at: item.updated_at,
          labels: Array.isArray(item.labels)
            ? item.labels.map((label) => (label as Record<string, unknown>).name)
            : [],
        };
      });
  }

  if (name === "github_list_pull_requests") {
    const state = ["open", "closed", "all"].includes(String(args.state)) ? String(args.state) : "open";
    const data = await githubGet(`${base}/pulls?state=${state}&per_page=20`);
    if (!Array.isArray(data)) return data;
    return data.map((pull) => {
      const item = pull as Record<string, unknown>;
      return {
        number: item.number,
        title: item.title,
        state: item.state,
        draft: item.draft,
        html_url: item.html_url,
        updated_at: item.updated_at,
        head: (item.head as Record<string, unknown> | undefined)?.ref,
        base: (item.base as Record<string, unknown> | undefined)?.ref,
      };
    });
  }

  if (name === "github_read_file") {
    if (typeof args.path !== "string" || !args.path.trim() || args.path.length > 300 || args.path.split("/").some((part) => !part || part === "." || part === "..")) {
      return { error: "A valid file path is required." };
    }
    const filePath = args.path.split("/").map(encodeURIComponent).join("/");
    const ref = typeof args.ref === "string" && args.ref.length <= 120
      ? `?ref=${encodeURIComponent(args.ref)}`
      : "";
    const data = await githubGet(`${base}/contents/${filePath}${ref}`);
    if (!data || typeof data !== "object") return data;
    const item = data as Record<string, unknown>;
    if (item.type !== "file" || typeof item.content !== "string") {
      return { error: "The requested path is not a regular file." };
    }
    const content = Buffer.from(item.content.replace(/\s/g, ""), "base64").toString("utf8");
    return {
      path: item.path,
      sha: item.sha,
      html_url: item.html_url,
      content: content.slice(0, 16_000),
      truncated: content.length > 16_000,
    };
  }

  return { error: "This GitHub tool is not available." };
}
