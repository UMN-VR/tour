export interface SelectorSource { commit: string; dirty: boolean; packageVersion: string; builtAt: string }
export interface SelectorFile { path: string; bytes: number; sha256: string }
export interface SelectorRelease {
  format: 'umn-vr-selector-release'; version: 1; owner: 'UMN-VR/tour';
  mountPath: '/tour/'; source: SelectorSource; files: SelectorFile[];
}
export const SELECTOR_ROUTE: '/tour/';
export const SELECTOR_DESTINATIONS: readonly string[];
export function sha256(bytes: string | Uint8Array): string;
export function selectorBuildSource(html: string, source: SelectorSource): SelectorSource;
export function writeSelectorRelease(input: { input: string; output: string; source: SelectorSource }): { release: SelectorRelease; descriptorSha256: string; payload: string };
export function verifySelectorRelease(folder: string, descriptorSha256: string): { release: SelectorRelease; descriptorSha256: string; payload: string };
