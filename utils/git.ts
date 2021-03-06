import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import parseDiff from 'parse-diff';
import { prompt } from 'inquirer';
import simplegit from 'simple-git/promise';

import logger from './logger';
import { TUTURE_ROOT } from '../constants';
import { Remote, RawDiff } from '../types';

// Interface for running git commands.
// https://github.com/steveukx/git-js
export const git = simplegit().silent(true);

export const diffPath = path.join(
  process.env.TUTURE_PATH || process.cwd(),
  TUTURE_ROOT,
  'diff.json',
);

/**
 * Store diff of all commits.
 */
export async function storeDiff(commits: string[]) {
  const diffPromises = commits.map(async (commit: string) => {
    const command = ['show', '-U99999', commit];
    const output = await git.raw(command);
    const diffText = output
      .replace(/\\ No newline at end of file\n/g, '')
      .split('\n\n')
      .slice(-1)[0];
    const diff = parseDiff(diffText);
    return { commit, diff } as RawDiff;
  });

  const diffs = await Promise.all(diffPromises);

  fs.writeFileSync(diffPath, JSON.stringify(diffs));

  return diffs;
}

/**
 * Append .tuture rule to gitignore.
 * If it's already ignored, do nothing.
 * If .gitignore doesn't exist, create one and add the rule.
 */
export function appendGitignore() {
  if (!fs.existsSync('.gitignore')) {
    fs.writeFileSync('.gitignore', `${TUTURE_ROOT}\n`);
    logger.log('info', '.gitignore file created.');
  } else if (
    !fs
      .readFileSync('.gitignore')
      .toString()
      .includes(TUTURE_ROOT)
  ) {
    fs.appendFileSync('.gitignore', `\n${TUTURE_ROOT}`);
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
    const remote = await git.remote([]);
    if (remote) {
      const origin = await git.remote(['get-url', remote.trim()]);
      if (origin) {
        github = origin.replace('.git', '').trim();
      }
    }
  } catch {
    // No remote url, infer github field from git username and cwd.
    let username = await git.raw(['config', '--get', 'user.name']);
    if (!username) {
      username = await git.raw(['config', '--global', '--get', 'user.name']);
    }

    if (username) {
      const { name: repoName } = path.parse(process.cwd());
      github = `https://github.com/${username.trim()}/${repoName}`;
    }
  }

  return github;
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
    fs.mkdirpSync(path.dirname(hookPath));
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

export async function selectRemotes(remotes: Remote[], selected?: Remote[]) {
  // All remotes are shown as:
  // <remote_name> (fetch: <fetch_ref>, push: <push_ref>)
  const remoteToChoice = (remote: Remote) => {
    const { name, refs } = remote;
    const { fetch, push } = refs;
    const { underline } = chalk;

    return `${name} (fetch: ${underline(fetch)}, push: ${underline(push)})`;
  };

  const choiceToRemote = (choice: string) => {
    const selectedRemote = choice.slice(0, choice.indexOf('(') - 1);
    return remotes.filter((remote) => remote.name === selectedRemote)[0];
  };

  const response = await prompt<{ remotes: string[] }>([
    {
      name: 'remotes',
      type: 'checkbox',
      message: 'Select remote repositories you want to sync to:',
      choices: remotes.map((remote) => remoteToChoice(remote)),
      default: (selected || []).map((remote) => remoteToChoice(remote)),
    },
  ]);

  return response.remotes.map((choice) => choiceToRemote(choice));
}
