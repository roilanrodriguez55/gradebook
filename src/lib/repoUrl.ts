const GITHUB_REPO_RE =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/.*)?\/?$/;

export function normalizeGithubUrl(input: string): string | null {
  const match = GITHUB_REPO_RE.exec(input.trim());
  if (!match) return null;
  const [, owner, repo] = match;
  return `https://github.com/${owner}/${repo}`;
}
