namespace FerbToolsBackgroundTabs {
  const DEFAULT_LOAD_TIMEOUT_MS = 30000;

  export interface Options {
    serviceName: string;
    reuse: 'origin' | 'path';
    navigateExisting?: boolean;
  }

  export async function getOrCreate(targetUrl: string, options: Options): Promise<chrome.tabs.Tab> {
    const normalizedTargetUrl: URL = normalizeUrl(targetUrl, options.serviceName);
    const tabs: chrome.tabs.Tab[] = await queryTabs();
    const matchingTabs: chrome.tabs.Tab[] = tabs.filter((tab: chrome.tabs.Tab): boolean => isMatchingTab(tab.url, normalizedTargetUrl, options.reuse));
    const existingTab: chrome.tabs.Tab | undefined =
      matchingTabs.find((tab: chrome.tabs.Tab): boolean => tab.status === 'complete') ?? matchingTabs[0];

    if (existingTab && typeof existingTab.id === 'number') {
      if (options.navigateExisting && existingTab.url !== normalizedTargetUrl.toString()) {
        await updateTab(existingTab.id, normalizedTargetUrl.toString());
        return waitForReadyTab(existingTab.id, normalizedTargetUrl, options, true);
      }

      return existingTab.status === 'complete'
        ? ensureMatchingTab(existingTab, normalizedTargetUrl, options)
        : waitForReadyTab(existingTab.id, normalizedTargetUrl, options);
    }

    const createdTab: chrome.tabs.Tab = await createTab(normalizedTargetUrl.toString());
    if (typeof createdTab.id !== 'number') {
      throw new Error(`Không tạo được ${options.serviceName} tab.`);
    }

    return createdTab.status === 'complete'
      ? ensureMatchingTab(createdTab, normalizedTargetUrl, options)
      : waitForReadyTab(createdTab.id, normalizedTargetUrl, options);
  }

  function queryTabs(): Promise<chrome.tabs.Tab[]> {
    return new Promise((resolve: (tabs: chrome.tabs.Tab[]) => void): void => {
      chrome.tabs.query({}, (tabs: chrome.tabs.Tab[]): void => {
        resolve(chrome.runtime.lastError ? [] : tabs);
      });
    });
  }

  function createTab(url: string): Promise<chrome.tabs.Tab> {
    return new Promise((resolve: (tab: chrome.tabs.Tab) => void, reject: (reason?: unknown) => void): void => {
      chrome.tabs.create({ url, active: false }, (tab: chrome.tabs.Tab): void => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(tab);
      });
    });
  }

  function updateTab(tabId: number, url: string): Promise<chrome.tabs.Tab> {
    return new Promise((resolve: (tab: chrome.tabs.Tab) => void, reject: (reason?: unknown) => void): void => {
      chrome.tabs.update(tabId, { url, active: false }, (tab?: chrome.tabs.Tab): void => {
        if (chrome.runtime.lastError || !tab) {
          reject(new Error(chrome.runtime.lastError?.message ?? 'Không chuyển được background tab.'));
          return;
        }
        resolve(tab);
      });
    });
  }

  function waitForReadyTab(tabId: number, targetUrl: URL, options: Options, requireTargetQuery = false): Promise<chrome.tabs.Tab> {
    return new Promise((resolve: (tab: chrome.tabs.Tab) => void, reject: (reason?: unknown) => void): void => {
      let isSettled = false;
      const timeoutId: number = window.setTimeout((): void => {
        settleError(`${options.serviceName} tab load quá lâu. Kiểm tra kết nối hoặc đăng nhập rồi thử lại.`);
      }, DEFAULT_LOAD_TIMEOUT_MS);

      const cleanup = (): void => {
        window.clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(handleUpdated);
        chrome.tabs.onRemoved.removeListener(handleRemoved);
      };

      const settleTab = (tab: chrome.tabs.Tab): void => {
        if (isSettled) {
          return;
        }
        isSettled = true;
        cleanup();
        resolve(tab);
      };

      const settleError = (message: string): void => {
        if (isSettled) {
          return;
        }
        isSettled = true;
        cleanup();
        reject(new Error(message));
      };

      const inspectTab = (tab: chrome.tabs.Tab): void => {
        if (tab.status !== 'complete') {
          return;
        }

        if (!isMatchingTab(tab.url, targetUrl, options.reuse)) {
          settleError(`${options.serviceName} cần đăng nhập. Mở tab vừa tạo, đăng nhập rồi thử lại.`);
          return;
        }

        if (requireTargetQuery && !isTargetNavigationUrl(tab.url, targetUrl)) {
          return;
        }
        settleTab(tab);
      };

      function handleUpdated(updatedTabId: number, _changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab): void {
        if (updatedTabId === tabId) {
          inspectTab(tab);
        }
      }

      function handleRemoved(removedTabId: number): void {
        if (removedTabId === tabId) {
          settleError(`${options.serviceName} tab đã bị đóng trước khi load xong.`);
        }
      }

      chrome.tabs.onUpdated.addListener(handleUpdated);
      chrome.tabs.onRemoved.addListener(handleRemoved);
      chrome.tabs.get(tabId, (tab: chrome.tabs.Tab): void => {
        if (chrome.runtime.lastError) {
          settleError(`Không đọc được ${options.serviceName} tab vừa mở.`);
          return;
        }
        inspectTab(tab);
      });
    });
  }

  function ensureMatchingTab(tab: chrome.tabs.Tab, targetUrl: URL, options: Options): chrome.tabs.Tab {
    if (!isMatchingTab(tab.url, targetUrl, options.reuse)) {
      throw new Error(`${options.serviceName} cần đăng nhập. Mở tab vừa tạo, đăng nhập rồi thử lại.`);
    }
    return tab;
  }

  function normalizeUrl(candidate: string, serviceName: string): URL {
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol');
      }
      return url;
    } catch (_error: unknown) {
      throw new Error(`${serviceName} URL không hợp lệ.`);
    }
  }

  function isMatchingTab(tabUrl: string | undefined, targetUrl: URL, reuse: Options['reuse']): boolean {
    if (!tabUrl) {
      return false;
    }

    try {
      const candidateUrl = new URL(tabUrl);
      return candidateUrl.origin === targetUrl.origin && (reuse === 'origin' || candidateUrl.pathname === targetUrl.pathname);
    } catch (_error: unknown) {
      return false;
    }
  }

  function isTargetNavigationUrl(tabUrl: string | undefined, targetUrl: URL): boolean {
    if (!tabUrl) {
      return false;
    }

    try {
      const candidateUrl = new URL(tabUrl);
      if (candidateUrl.origin !== targetUrl.origin || candidateUrl.pathname !== targetUrl.pathname) {
        return false;
      }

      let matchesTargetQuery = true;
      targetUrl.searchParams.forEach((value: string, key: string): void => {
        if (!candidateUrl.searchParams.getAll(key).includes(value)) {
          matchesTargetQuery = false;
        }
      });
      return matchesTargetQuery;
    } catch (_error: unknown) {
      return false;
    }
  }
}
