namespace FerbToolsSfccToolkitUrlFixPopupFeature {
  const STORAGE_KEY = 'ferbToolsSfccToolkitUrlFixEnabled';

  export interface Options {
    enabledInput: HTMLInputElement;
    setStatus: (status: string) => void;
  }

  export function init(options: Options): void {
    const { enabledInput, setStatus } = options;

    enabledInput.addEventListener('change', (): void => {
      void saveEnabled(enabledInput.checked);
    });

    void loadEnabled();

    async function loadEnabled(): Promise<void> {
      enabledInput.checked = await readEnabled();
    }

    async function saveEnabled(enabled: boolean): Promise<void> {
      enabledInput.disabled = true;
      try {
        await writeEnabled(enabled);
        setStatus(`Đã ${enabled ? 'bật' : 'tắt'} Fix SFCC Toolkit URL.`);
      } catch (error: unknown) {
        enabledInput.checked = !enabled;
        setStatus(error instanceof Error ? error.message : 'Lưu Fix SFCC Toolkit URL lỗi.');
      } finally {
        enabledInput.disabled = false;
      }
    }
  }

  function readEnabled(): Promise<boolean> {
    return new Promise((resolve): void => {
      chrome.storage.local.get(STORAGE_KEY, (items: Record<string, unknown>): void => {
        resolve(chrome.runtime.lastError ? true : items[STORAGE_KEY] !== false);
      });
    });
  }

  function writeEnabled(enabled: boolean): Promise<void> {
    return new Promise((resolve, reject): void => {
      chrome.storage.local.set({ [STORAGE_KEY]: enabled }, (): void => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }
}
