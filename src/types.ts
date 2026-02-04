import { EventHandler } from '@create-figma-plugin/utilities'

export interface SyncSettings {
  githubRepo: string
  githubToken: string
}

export interface SyncToGitHubHandler extends EventHandler {
  name: 'SYNC_TO_GITHUB'
  handler: (settings: SyncSettings) => void
}

export interface SyncToGitHubResultHandler extends EventHandler {
  name: 'SYNC_TO_GITHUB_RESULT'
  handler: (success: boolean, message: string) => void
}

export interface GetCachedSettingsHandler extends EventHandler {
  name: 'GET_CACHED_SETTINGS'
  handler: () => void
}

export interface CachedSettingsResultHandler extends EventHandler {
  name: 'CACHED_SETTINGS_RESULT'
  handler: (settings: SyncSettings | null) => void
}

export interface SaveSettingsHandler extends EventHandler {
  name: 'SAVE_SETTINGS'
  handler: (settings: SyncSettings) => void
}

export interface SyncProgressHandler extends EventHandler {
  name: 'SYNC_PROGRESS'
  handler: (message: string) => void
}

export interface DownloadManifestHandler extends EventHandler {
  name: 'DOWNLOAD_MANIFEST'
  handler: () => void
}

export interface ManifestDataHandler extends EventHandler {
  name: 'MANIFEST_DATA'
  handler: (data: string) => void
}
