import cp from 'child_process';
import fs from 'fs-extra';
import mm from 'micromatch';
import path from 'path';
import which from 'which';
import parseDiff from 'parse-diff';

import logger from '../utils/logger';
import { TUTURE_ROOT } from '../constants';

/**
 * Check if Git command is available.
 */
export function isGitAvailable() {
  return which.sync('git', { nothrow: true }) !== null;
}

/**
 * Run arbitrary Git commands.
 */
function runGitCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const git = cp.spawn('git', args);
    let stdout = '';
    let stderr = '';

    git.stdout.on('data', (data) => {
      stdout += data;
    });

    git.stderr.on('data', (data) => {
      stderr += data;
    });

    git.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr));
      }
    });
  });
}

/**
 * Initialize a Git repo.
 */
export async function initGit() {
  await runGitCommand(['init']);
}

/**
 * Get an array of Git commit messages.
 */
export async function getGitLogs() {
  try {
    const output = await runGitCommand(['log', '--oneline', '--no-merges']);
    return output.trim().split('\n');
  } catch (err) {
    // Current repo doesn't have any commit yet.
    return [];
  }
}

/**
 * Get all changed files of a given commit.
 */
export async function getGitDiff(commit: string, ignoredFiles: string[]) {
  const output = await runGitCommand(['show', commit, '--name-only']);
  let changedFiles = output
    .split('\n\n')
    .slice(-1)[0]
    .split('\n');
  changedFiles = changedFiles.slice(0, changedFiles.length - 1);

  return changedFiles.map((file) => {
    const fileObj: any = { file };
    if (!ignoredFiles.some((pattern: string) => mm.isMatch(file, pattern))) {
      fileObj.display = true;
    }
    return fileObj;
  });
}

/**
 * Store diff of all commits.
 */
export async function storeDiff(commits: string[], contextLines?: number) {
  const diffPromises = commits.map(async (commit: string) => {
    const command = ['show', commit];
    if (contextLines) {
      command.splice(1, 0, `-U${contextLines}`);
    }

    const output = await runGitCommand(command);
    const diffText = output
      .replace(/\\ No newline at end of file\n/g, '')
      .split('\n\n')
      .slice(-1)[0];
    const diff = parseDiff(diffText);
    return { commit, diff };
  });

  const diffs = await Promise.all(diffPromises);

  fs.writeFileSync(path.join(TUTURE_ROOT, 'diff.json'), JSON.stringify(diffs));
}

/**
 * Append .tuture rule to gitignore.
 * If it's already ignored, do nothing.
 * If .gitignore doesn't exist, create one and add the rule.
 * @param config User config
 */
export function appendGitignore(config: any) {
  const ignoreRules = [
    '# Tuture-related files\n',
    TUTURE_ROOT,
    config.buildPath,
  ].join('\n');

  if (!fs.existsSync('.gitignore')) {
    fs.writeFileSync('.gitignore', `${ignoreRules}\n`);
    logger.log('info', '.gitignore file created.');
  } else if (
    !fs
      .readFileSync('.gitignore')
      .toString()
      .includes(TUTURE_ROOT)
  ) {
    fs.appendFileSync('.gitignore', `\n${ignoreRules}`);
    logger.log('info', '.gitignore rules appended.');
  }
}

/**
 * Infer github field from available information.
 */
export async function inferGithubField() {
  let github: string = '';
  try {
    // Trying to infer github repo url from origin.
    github = await runGitCommand(['remote', 'get-url', 'origin']);
    if (github) {
      github = github.replace('.git', '').trim();
    }
  } catch {
    // No remote url, infer github field from git username and cwd.
    let username = await runGitCommand(['config', '--get', 'user.name']);
    if (!username) {
      username = await runGitCommand([
        'config',
        '--global',
        '--get',
        'user.name',
      ]);
    }

    if (username) {
      const { name: repoName } = path.parse(process.cwd());
      github = `https://github.com/${username.trim()}/${repoName}`;
    }
  }

  return github;
}

/**
 * Get the name of current branch.
 */
export async function getCurrentBranch() {
  const branch = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']);
  return branch;
}

/**
 * List all local branches.
 */
export async function listBranches() {
  const output = await runGitCommand(['branch']);
  return output
    .replace('* ', '  ')
    .split(/\r?\n/)
    .map((branch) => branch.trim())
    .filter((branch) => branch);
}

/**
 * Generate Git hook for different platforms.
 */
function getGitHook() {
  let tuturePath = path.join(__dirname, '..', '..', 'bin', 'run');
  if (process.platform === 'win32') {
    // Replace all \ with / in the path, as is required in Git hook on windows
    // e.g. C:\foo\bar => C:/foo/bar
    tuturePath = tuturePath.replace(/\\/g, '/');
  }
  return `#!/bin/sh\n${tuturePath} reload\n`;
}

/**
 * Add post-commit Git hook for reloading.
 */
export function appendGitHook() {
  const reloadHook = getGitHook();
  const hookPath = path.join('.git', 'hooks', 'post-commit');
  if (!fs.existsSync(hookPath)) {
    fs.writeFileSync(hookPath, reloadHook, { mode: 0o755 });
    logger.log('info', 'Git post-commit hook added.');
  } else if (
    !fs
      .readFileSync(hookPath)
      .toString()
      .includes('reload')
  ) {
    fs.appendFileSync(hookPath, reloadHook);
    logger.log('info', 'Git post-commit hook configured.');
  }
}

/**
 * Remove Git hook for reloading.
 */
export function removeGitHook() {
  const reloadHook = getGitHook();
  const hookPath = path.join('.git', 'hooks', 'post-commit');
  if (fs.existsSync(hookPath)) {
    const hook = fs.readFileSync(hookPath).toString();
    if (hook === reloadHook) {
      // Auto-generated by Tuture, so delete it.
      fs.removeSync(hookPath);
    } else {
      fs.writeFileSync(hookPath, hook.replace('tuture reload', ''));
    }
    logger.log('info', 'Git post-commit hook removed.');
  }
}
