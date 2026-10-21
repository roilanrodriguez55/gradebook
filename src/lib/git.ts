import { invoke } from "@tauri-apps/api/core";

export type GitInfo = { version: string; path: string };

export function checkGit(gitPath?: string): Promise<GitInfo> {
  return invoke<GitInfo>("check_git", { gitPath: gitPath || null });
}
