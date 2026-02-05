import { on, showUI, emit } from "@create-figma-plugin/utilities";

import {
  SyncToGitHubHandler,
  SyncToGitHubResultHandler,
  GetCachedSettingsHandler,
  CachedSettingsResultHandler,
  SaveSettingsHandler,
  SyncProgressHandler,
  DownloadManifestHandler,
  ManifestDataHandler,
  SyncSettings,
} from "./types";

interface IconInfo {
  id: string;
  type: string;
  name: string;
  svg: string;
  lastModified: number;
}

interface GroupInfo {
  name: string;
  children: IconInfo[];
}

export default function () {
  on<SyncToGitHubHandler>("SYNC_TO_GITHUB", async function (settings: SyncSettings) {
    try {
      // 保存配置到缓存
      await saveSettingsToCache(settings);

      // 发送进度：开始提取图标
      emit<SyncProgressHandler>(
        "SYNC_PROGRESS",
        "Extracting icons from Figma...",
      );

      // 提取 Figma 设计稿信息
      const groups = await extractIconsFromFigma();

      // 发送进度：开始同步
      emit<SyncProgressHandler>(
        "SYNC_PROGRESS",
        `Syncing ${groups.length} icons to GitHub...`,
      );

      // 同步到 GitHub
      console.log("groups:", groups);
      await syncIconsToGitHub(groups, settings);

      // 发送成功结果
      emit<SyncToGitHubResultHandler>(
        "SYNC_TO_GITHUB_RESULT",
        true,
        "Sync successful!",
      );
    } catch (error) {
      console.error("Sync error:", error);
      emit<SyncToGitHubResultHandler>(
        "SYNC_TO_GITHUB_RESULT",
        false,
        error instanceof Error ? error.message : "Unknown error occurred",
      );
    }
  });

  // 处理获取缓存配置请求
  on<GetCachedSettingsHandler>("GET_CACHED_SETTINGS", async function () {
    const settings = await getSettingsFromCache();
    emit<CachedSettingsResultHandler>("CACHED_SETTINGS_RESULT", settings);
  });

  // 处理保存配置请求
  on<SaveSettingsHandler>("SAVE_SETTINGS", async function (settings) {
    await saveSettingsToCache(settings);
  });

  // 处理下载 manifest 请求
  on<DownloadManifestHandler>("DOWNLOAD_MANIFEST", async function () {
    try {
      emit<SyncProgressHandler>("SYNC_PROGRESS", "Extracting icons from Figma...");
      
      // 提取图标
      const groups = await extractIconsFromFigma();
      
      // 构建 manifest
      const manifest = {
        lastSyncTime: Date.now(),
        groups: groups.map(group => ({
          name: group.name,
          icons: group.children.map(icon => ({
            id: icon.id,
            name: icon.name,
            type: icon.type,
            svg: icon.svg,
            lastModified: icon.lastModified
          }))
        }))
      };
      
      // 发送 manifest 数据到 UI
      emit<ManifestDataHandler>("MANIFEST_DATA", JSON.stringify(manifest, null, 2));
    } catch (error) {
      console.error("Download manifest error:", error);
      emit<SyncProgressHandler>("SYNC_PROGRESS", "Error: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  });

  // 调整 UI 高度以适应新的表单
  showUI({ height: 520, width: 320 });
}

// 从缓存获取配置
async function getSettingsFromCache(): Promise<SyncSettings | null> {
  try {
    const settingsStr =
      await figma.clientStorage.getAsync("githubSyncSettings");
    return settingsStr ? JSON.parse(settingsStr) : null;
  } catch (error) {
    console.error("Failed to get cached settings:", error);
    return null;
  }
}

// 保存配置到缓存
async function saveSettingsToCache(settings: SyncSettings): Promise<void> {
  try {
    await figma.clientStorage.setAsync(
      "githubSyncSettings",
      JSON.stringify(settings),
    );
  } catch (error) {
    console.error("Failed to save settings to cache:", error);
  }
}

async function extractIconsFromFigma(): Promise<GroupInfo[]> {
  const groups: GroupInfo[] = [];

  const pageChildren = figma.currentPage.children;

  // 遍历页面的顶层children（图标容器）
  for (const container of pageChildren) {
    if (!("children" in container) || !container.children) continue;

    // 在容器中查找title和svgGroup
    const titleNode = container.children.find(
      (child) => child.type === "TEXT",
    ) as TextNode;
    const svgGroupNode = container.children.find(
      (child) => child.type === "GROUP",
    ) as GroupNode | undefined;

    // 处理svgGroup，提取其中的图标
    const icons: IconInfo[] = await processSvgGroup(svgGroupNode);
    
    // 打印每个 icon 的 name 和 id
    icons.forEach(icon => {
      console.log(`  - ${icon.name} (id: ${icon.id})`);
    });

    // 保存当前分组
    groups.push({ name: titleNode?.characters?.trim() || container.name, children: [...icons] });
  }

  // 全局处理：格式化 name 并确保唯一
  console.log('\n=== Global Name Processing ===');
  const usedNames = new Set<string>();
  let renameCount = 0;

  for (const group of groups) {
    for (const icon of group.children) {
      // 1. 格式化 name（小写、替换特殊字符等）
      let formattedName = icon.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-+/g, "-");

      // 2. 确保唯一性
      let uniqueName = formattedName;
      let counter = 1;
      while (usedNames.has(uniqueName)) {
        uniqueName = `${formattedName}-${counter}`;
        counter++;
      }

      usedNames.add(uniqueName);

      if (uniqueName !== icon.name) {
        renameCount++;
        console.log(`⚠️ Renamed: ${icon.name} -> ${uniqueName} (id: ${icon.id})`);
      }

      icon.name = uniqueName;
    }
  }

  console.log(`Total renamed: ${renameCount}`);
  console.log(`Total unique names: ${usedNames.size}`);

  return groups;
}

async function processSvgGroup(
  svgGroup: GroupNode | undefined,
): Promise<IconInfo[]> {
  const icons: IconInfo[] = [];

  if (!svgGroup) return icons;

  // 递归查找所有 INSTANCE 类型且 24x24 的节点
  async function findIcons(node: SceneNode): Promise<void> {
    // 检查当前节点是否为 INSTANCE 类型且 24x24
    if (node.type === 'INSTANCE' && node.width === 24 && node.height === 24) {
      try {
        const svgUint8Array = await node.exportAsync({ format: "SVG" });
        let svgString = String.fromCharCode.apply(null, svgUint8Array as any);

        // 验证SVG结构
        const isValidSvg =
          svgString.trim().startsWith("<svg") &&
          svgString.trim().endsWith("</svg>");
        if (!isValidSvg) {
          console.warn(`Invalid SVG structure for node ${node.name}`);
          return;
        }

        // 使用原始节点名称（后续统一处理格式）
        const rawName = node.name;

        icons.push({
          id: node.id,
          type: node.type,
          name: rawName,
          svg: svgString,
          lastModified: Date.now(),
        });

        console.log(`✓ Found icon: ${rawName} (INSTANCE)`);
        return; // 找到图标后不再递归子节点
      } catch (error) {
        console.warn(`Failed to export SVG for node ${node.name}:`, error);
      }
    }

    // 如果当前节点不是 INSTANCE 或不是 24x24，递归查找子节点
    if ("children" in node && node.children) {
      for (const child of node.children) {
        await findIcons(child);
      }
    }
  }

  // 从 svgGroup 开始递归查找
  for (const child of svgGroup.children) {
    await findIcons(child);
  }

  return icons;
}

// Base64 编码函数（Figma 插件环境不支持 btoa）
function base64Encode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;
    const bitmap = (a << 16) | (b << 8) | c;
    result += chars.charAt((bitmap >> 18) & 63);
    result += chars.charAt((bitmap >> 12) & 63);
    result += i - 2 < str.length ? chars.charAt((bitmap >> 6) & 63) : '=';
    result += i - 1 < str.length ? chars.charAt(bitmap & 63) : '=';
  }
  return result;
}

async function syncIconsToGitHub(groups: GroupInfo[], settings: any) {
  const { githubRepo, githubToken } = settings;

  // 验证GitHub仓库格式
  if (!githubRepo || !githubRepo.includes("/")) {
    throw new Error("Invalid GitHub repository format. Use owner/repo format.");
  }

  // 验证token
  if (!githubToken || githubToken.length < 20) {
    throw new Error(
      "Invalid GitHub token. Please provide a valid personal access token.",
    );
  }

  // GitHub API 基本 URL
  const apiBaseUrl = `https://api.github.com/repos/${githubRepo}`;

  // 构建新的 manifest 结构
  const newManifest = {
    lastSyncTime: Date.now(),
    groups: groups.map(group => ({
      name: group.name,
      icons: group.children.map(icon => ({
        id: icon.id,
        name: icon.name,
        type: icon.type,
        svg: icon.svg,
        lastModified: icon.lastModified
      }))
    }))
  };

  // 打印 manifest 结构
  console.log('\n=== Manifest Structure ===');
  console.log(`Groups: ${newManifest.groups.length}`);
  newManifest.groups.forEach(group => {
    console.log(`  ${group.name}: ${group.icons.length} icons`);
  });

  // 计算总大小
  const manifestJson = JSON.stringify(newManifest, null, 2);
  const sizeInKB = (manifestJson.length / 1024).toFixed(2);
  console.log(`\nManifest size: ${sizeInKB} KB`);
  console.log(`Total icons: ${newManifest.groups.reduce((sum, g) => sum + g.icons.length, 0)}`);

  // 上传 manifest.json 文件
  const iconCount = newManifest.groups.reduce((sum, g) => sum + g.icons.length, 0);
  emit<SyncProgressHandler>('SYNC_PROGRESS', 'Uploading to GitHub...');
  await createOrUpdateFile(
    'figma-icons-manifest.json',
    manifestJson,
    `feat: Update icons manifest - ${iconCount} icons`
  );

  // 创建或更新文件的函数
  async function createOrUpdateFile(
    path: string,
    content: string,
    message: string,
  ) {
    const url = `${apiBaseUrl}/contents/${path}`;

    // 先检查文件是否存在
    let sha: string | undefined;
    try {
      const checkResponse = await fetch(url, {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (checkResponse.ok) {
        const fileData = await checkResponse.json();
        sha = fileData.sha;
      }
    } catch (error) {
      console.error("Failed to check file existence:", error);
    }

    // 创建或更新文件（GitHub API 始终使用 PUT）
    const body: any = {
      message,
      content: base64Encode(content),
    };
    // 如果文件存在，需要提供 sha 进行更新
    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `token ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMessage = `Failed to ${sha ? "update" : "create"} file`;
      try {
        const errorData = await response.json();
        errorMessage += `: ${errorData.message}`;
        if (response.status === 401) {
          errorMessage += " (Check your GitHub token)";
        } else if (response.status === 403) {
          errorMessage += " (Check repository permissions)";
        } else if (response.status === 404) {
          errorMessage += " (Repository not found)";
        }
      } catch (e) {
        errorMessage += ` (HTTP ${response.status})`;
      }
      throw new Error(errorMessage);
    }
  }
}
