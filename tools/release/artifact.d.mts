export interface TourFile { path: string; bytes: number; sha256: string }
export interface TourSource { commit: string; dirty: boolean; packageVersion: string; builtAt: string }
export interface TourContent { manifestUrl: string; revision: string; manifestSha256: string }
export interface TourClubPin { schemaVersion: 1; repository: 'UMN-VR/tour'; mountPath: '/tour/twin-cities/'; descriptorSha256: string }
export interface TourRelease {
  format: 'umn-vr-tour-release'; version: 1; owner: 'UMN-VR/tour';
  source: TourSource; mountPath: '/tour/twin-cities/'; base: '/';
  worker: { url: '/foss-earth-sw.js'; scope: '/' }; content: TourContent;
  compatibility: { currentTabIds: string[] }; files: TourFile[];
}
export const TOUR_ROUTE: '/tour/twin-cities/';
export const CURRENT_TAB_IDS: readonly string[];
export function sha256(bytes: string | Uint8Array): string;
export function tourBuildSource(html: string, identity: Omit<TourSource, 'builtAt'>): TourSource;
export function writeTourRelease(input: { input: string; output: string; source: TourSource; content: TourContent }): { release: TourRelease; descriptorSha256: string; clubPin: TourClubPin };
export function verifyTourRelease(folder: string, expectedDescriptorSha256: string): { release: TourRelease; payload: string };
