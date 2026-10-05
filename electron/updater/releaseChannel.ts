import { compareReleaseVersions, validateReleaseVersion } from './releaseVersion';
export interface GitHubRelease { tag_name: string; draft?: boolean; prerelease?: boolean; published_at?: string; body?: string }
/** Stable users stay stable; prerelease installations may follow the beta channel. */
export function selectEligibleRelease(releases: GitHubRelease[], installed: string): GitHubRelease | null {
  validateReleaseVersion(installed);
  const beta = installed.split('+')[0].includes('-');
  return releases.filter(release => {
    const version = release.tag_name?.replace(/^v/, '');
    try {
      const prerelease = version.split('+')[0].split('-')[1];
      const eligibleChannel = prerelease === undefined ? !release.prerelease : beta && /^(beta|rc)(?:\.|$)/.test(prerelease);
      return !release.draft && eligibleChannel && compareReleaseVersions(version, installed) > 0;
    }
    catch { return false; }
  }).sort((left, right) => compareReleaseVersions(right.tag_name.replace(/^v/, ''), left.tag_name.replace(/^v/, '')))[0] ?? null;
}
