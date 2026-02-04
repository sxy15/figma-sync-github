import {
  Button,
  Container,
  render,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { emit, on } from '@create-figma-plugin/utilities'
import { h } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'

import {
  SyncSettings,
  SyncToGitHubHandler,
  SyncToGitHubResultHandler,
  GetCachedSettingsHandler,
  CachedSettingsResultHandler,
  SaveSettingsHandler,
  SyncProgressHandler,
  DownloadManifestHandler,
  ManifestDataHandler
} from './types'

function Plugin() {
  const [githubRepo, setGithubRepo] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null)
  const [syncProgress, setSyncProgress] = useState<string>('')

  useEffect(function () {
    // 监听同步结果
    on<SyncToGitHubResultHandler>('SYNC_TO_GITHUB_RESULT', function (success, message) {
      setIsSyncing(false)
      setSyncProgress('')
      setSyncResult({ success, message })
    })

    // 监听进度更新
    on<SyncProgressHandler>('SYNC_PROGRESS', function (message) {
      setSyncProgress(message)
    })

    // 监听 manifest 数据
    on<ManifestDataHandler>('MANIFEST_DATA', function (data) {
      setIsSyncing(false)
      setSyncProgress('')
      
      // 创建并下载文件
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'figma-icons-manifest.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      setSyncResult({ success: true, message: 'Manifest downloaded successfully!' })
    })

    // 获取缓存的配置
    emit<GetCachedSettingsHandler>('GET_CACHED_SETTINGS')

    // 监听缓存配置结果
    on<CachedSettingsResultHandler>('CACHED_SETTINGS_RESULT', function (settings) {
      if (settings) {
        setGithubRepo(settings.githubRepo)
        setGithubToken(settings.githubToken)
      }
    })
  }, [])

  // 当配置更改时保存到缓存
  useEffect(function () {
    const settings: SyncSettings = {
      githubRepo,
      githubToken
    }
    emit<SaveSettingsHandler>('SAVE_SETTINGS', settings)
  }, [githubRepo, githubToken])

  const handleSyncToGitHubButtonClick = useCallback(
    function () {
      if (!githubRepo || !githubToken) {
        setSyncResult({ success: false, message: 'Please fill in GitHub repo and token' })
        return
      }
      
      setIsSyncing(true)
      setSyncResult(null)
      
      const settings: SyncSettings = {
        githubRepo,
        githubToken
      }

      emit<SyncToGitHubHandler>('SYNC_TO_GITHUB', settings)
    },
    [githubRepo, githubToken]
  )

  const handleDownloadManifest = useCallback(
    function () {
      setIsSyncing(true)
      setSyncResult(null)
      emit<DownloadManifestHandler>('DOWNLOAD_MANIFEST')
    },
    []
  )

  return (
    <Container space="medium">
      <VerticalSpace space="small" />
      
      <h2>Figma Sync to GitHub</h2>
      <VerticalSpace space="medium" />
      
      <div>
        <label>GitHub Repository (owner/repo):</label>
        <input
          type="text"
          placeholder="e.g., owner/repo"
          value={githubRepo}
          onChange={(e: Event) => {
            const target = e.target as HTMLInputElement
            if (target) {
              setGithubRepo(target.value)
            }
          }}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            marginTop: '4px',
            boxSizing: 'border-box'
          }}
        />
      </div>
      <VerticalSpace space="medium" />
      
      <div>
        <label>GitHub Personal Access Token:</label>
        <input
          type="password"
          placeholder="GitHub PAT with repo access"
          value={githubToken}
          onChange={(e: Event) => {
            const target = e.target as HTMLInputElement
            if (target) {
              setGithubToken(target.value)
            }
          }}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            marginTop: '4px',
            boxSizing: 'border-box'
          }}
        />
      </div>
      <VerticalSpace space="large" />
      
      <Button
        fullWidth
        onClick={handleSyncToGitHubButtonClick}
        disabled={isSyncing}
      >
        {isSyncing ? 'Syncing...' : 'Sync to GitHub'}
      </Button>
      <VerticalSpace space="small" />

      <Button
        fullWidth
        onClick={handleDownloadManifest}
        disabled={isSyncing}
        secondary
      >
        {isSyncing ? 'Generating...' : 'Download Manifest JSON'}
      </Button>
      <VerticalSpace space="small" />

      {syncProgress && (
        <div style={{
          padding: '8px',
          borderRadius: '4px',
          backgroundColor: '#f0f8ff',
          color: '#0066cc',
          marginTop: '8px',
          fontSize: '12px'
        }}>
          {syncProgress}
        </div>
      )}
      
      {syncResult && (
        <div style={{ 
          padding: '8px', 
          borderRadius: '4px', 
          backgroundColor: syncResult.success ? '#e6f7ec' : '#fff2f0',
          color: syncResult.success ? '#237804' : '#c53030',
          marginTop: '8px'
        }}>
          {syncResult.message}
        </div>
      )}
      
      <VerticalSpace space="small" />
    </Container>
  )
}

export default render(Plugin)
