namespace FerbToolsSfccToolkitUrlFixContentFeature {
  const STORAGE_KEY = 'ferbToolsSfccToolkitUrlFixEnabled';
  const APP_VERSION: string = chrome.runtime.getManifest().version;
  const LOG_PREFIX = `[FerbTools v${APP_VERSION} | Fix SFCC Toolkit URL]`;
  const HOSTS = {
    stg: 'staging-asia-samsonite.demandware.net',
    dev: 'development-asia-samsonite.demandware.net',
  } as const;

  type Environment = keyof typeof HOSTS;

  interface Controller {
    fixURL: (value: string | null) => string | null;
    stop: () => void;
  }

  interface ToolkitWindow extends Window {
    __ferbToolsSfccToolkitUrlFix?: Controller;
  }

  const toolkitWindow: ToolkitWindow = window;
  toolkitWindow.__ferbToolsSfccToolkitUrlFix?.stop();

  const environment: Environment | null = detectEnvironment(window.location.hostname);
  let observer: MutationObserver | null = null;
  let clickListenerAttached = false;

  function detectEnvironment(hostname: string): Environment | null {
    const normalizedHostname: string = hostname.toLowerCase();
    if (normalizedHostname.includes('.stg')) {
      return 'stg';
    }
    if (normalizedHostname.includes('.dev')) {
      return 'dev';
    }
    return null;
  }

  function fixURL(value: string | null): string | null {
    if (!value || !environment || !value.includes('StorefrontEditing-')) {
      return value;
    }

    try {
      const url = new URL(value, window.location.href);
      if (!url.pathname.includes('StorefrontEditing-')) {
        return value;
      }

      url.protocol = 'https:';
      url.host = HOSTS[environment];
      url.pathname = url.pathname.replace(/\/Sites-Site\/-\/(?=StorefrontEditing-)/, '/Sites-Site/default/');
      return url.href;
    } catch {
      return value;
    }
  }

  function fixLink(link: HTMLAnchorElement): void {
    const oldURL: string | null = link.getAttribute('href');
    const newURL: string | null = fixURL(oldURL);
    if (newURL !== oldURL && newURL !== null) {
      link.setAttribute('href', newURL);
    }
  }

  function fixLinks(root: Node): void {
    if (root instanceof HTMLAnchorElement) {
      fixLink(root);
    }

    if (root instanceof Document || root instanceof Element) {
      root.querySelectorAll<HTMLAnchorElement>('a[href*="StorefrontEditing-"]').forEach(fixLink);
    }
  }

  function onMutations(mutations: MutationRecord[]): void {
    mutations.forEach((mutation: MutationRecord): void => {
      if (mutation.type === 'attributes') {
        fixLinks(mutation.target);
      }
      mutation.addedNodes.forEach((node: Node): void => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          fixLinks(node);
        }
      });
    });
  }

  function onClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) {
      return;
    }

    const link: HTMLAnchorElement | null = event.target.closest<HTMLAnchorElement>('a[href*="StorefrontEditing-"]');
    if (link) {
      fixLink(link);
    }
  }

  function start(): void {
    if (!environment || observer) {
      return;
    }

    fixLinks(document);
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    });
    document.addEventListener('click', onClick, true);
    clickListenerAttached = true;
    console.info(`${LOG_PREFIX} Active: ${environment.toUpperCase()} → ${HOSTS[environment]}`);
  }

  function deactivate(announce: boolean): void {
    const wasActive: boolean = observer !== null || clickListenerAttached;
    observer?.disconnect();
    observer = null;
    if (clickListenerAttached) {
      document.removeEventListener('click', onClick, true);
      clickListenerAttached = false;
    }
    if (announce && wasActive) {
      console.info(`${LOG_PREFIX} Stopped`);
    }
  }

  function applyEnabled(enabled: boolean): void {
    if (enabled) {
      start();
    } else {
      deactivate(true);
    }
  }

  function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
    if (areaName !== 'local' || !(STORAGE_KEY in changes)) {
      return;
    }
    applyEnabled(changes[STORAGE_KEY].newValue !== false);
  }

  function readEnabled(): Promise<boolean> {
    return new Promise((resolve): void => {
      chrome.storage.local.get(STORAGE_KEY, (items: Record<string, unknown>): void => {
        if (chrome.runtime.lastError) {
          console.warn(`${LOG_PREFIX} Cannot read setting: ${chrome.runtime.lastError.message}`);
          resolve(true);
          return;
        }
        resolve(items[STORAGE_KEY] !== false);
      });
    });
  }

  chrome.storage.onChanged.addListener(onStorageChanged);
  void readEnabled().then(applyEnabled);

  toolkitWindow.__ferbToolsSfccToolkitUrlFix = {
    fixURL,
    stop(): void {
      deactivate(false);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    },
  };
}
