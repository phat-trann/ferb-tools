namespace FerbToolsContentAssetExport {
  const CONTENT_ASSET_SETTINGS_STORAGE_KEY = 'ferbToolsContentAssetSettings';
  const WINDOW_FLAG = '__ferbToolsContentAssetExportBootstrapped__';
  type ContentAssetGroupKey = 'generic' | 'page' | 'custom' | 'sitemap';
  type XmlWrapperKey = ContentAssetGroupKey | 'folder';

  interface ContentAssetItem {
    id: string;
    lang: string;
    isLocalized: boolean;
    values: string[];
    siteSpecificUrl?: string;
  }

  type ContentAssetGroups = Record<ContentAssetGroupKey, ContentAssetItem[]>;

  interface LibraryInfo {
    shared: boolean;
    xml?: string;
  }

  interface ContentAssetResult {
    xml: string;
    filename: string;
  }

  interface ContentAssetFragment {
    contentId: string;
    contentXml: string;
    libraryOpen: string;
  }

  interface BuildContext {
    doc: Document;
    url: string;
    origin: string;
  }

  interface LocalePage {
    html: string;
    url: string;
  }

  interface ContentAssetExportWindow extends Window {
    __ferbToolsContentAssetExportBootstrapped__?: boolean;
  }

  interface XmlWrapper {
    opening: string;
    closing: string;
  }

  type SiteValueFormatter = (values: string[]) => string;
  type Renderer = (items: ContentAssetItem[]) => Promise<string> | string;
  type TaskLimiter = <TResult>(task: () => Promise<TResult>) => Promise<TResult>;

  const FIELD_TAG_MAP: Record<string, string> = {
    name: 'display-name',
    description: 'description',
    onlineFlag: 'online-flag',
    searchableFlag: 'searchable-flag',
    pageTitle: 'page-title',
    pageDescription: 'page-description',
    pageKeywords: 'page-keywords',
    pageURL: 'page-url',
    siteMapIncluded: 'sitemap-included-flag',
    siteMapChangeFrequency: 'sitemap-changefrequency',
    siteMapPriority: 'sitemap-priority',
    template: 'template',
  };

  const XML_WRAPPERS: Record<XmlWrapperKey, XmlWrapper> = {
    page: { opening: '        <page-attributes>\n', closing: '        </page-attributes>\n' },
    custom: { opening: '        <custom-attributes>\n', closing: '        </custom-attributes>\n' },
    folder: { opening: '<folder-links>', closing: '</folder-links>' },
    generic: { opening: '', closing: '' },
    sitemap: { opening: '', closing: '' },
  };

  const GENERIC_FIELDS = ['ID', 'name', 'description', 'onlineFlag', 'searchableFlag', 'pageTitle', 'pageDescription', 'pageKeywords', 'pageURL', 'template'];
  const SITEMAP_FIELDS = ['siteMapIncluded', 'siteMapChangeFrequency', 'siteMapPriority'];
  const PAGE_FIELDS = ['pageTitle', 'pageDescription', 'pageKeywords', 'pageURL'];
  const IGNORED_FIELDS = ['ID'];
  const GROUP_KEYS: ContentAssetGroupKey[] = ['generic', 'page', 'custom', 'sitemap'];
  let activeSettings: ContentAssetSettings = FerbToolsContentAssetConfig.createDefaultSettings();

  const renderers: Record<ContentAssetGroupKey, Renderer> & {
    cleanup: (items: ContentAssetItem[]) => ContentAssetItem[];
    getDataBySite: (url: string, openingTag: string, closingTag: string, formatValues?: SiteValueFormatter) => Promise<string>;
    folder: (items: Element[]) => string;
  } = {
    cleanup(items: ContentAssetItem[]): ContentAssetItem[] {
      return items.filter((item: ContentAssetItem): boolean => {
        if (item.siteSpecificUrl) return true;
        return item.values.filter(isEffectiveValue).length > 0;
      });
    },

    async getDataBySite(url: string, openingTag: string, closingTag: string, formatValues?: SiteValueFormatter): Promise<string> {
      let siteSpecificXml = '';
      const doc: Document = await fetchHtmlDocument(url);
      const uncheckedInputs: NodeListOf<HTMLInputElement> = doc.querySelectorAll('input[type="checkbox"]:not(:checked)');

      uncheckedInputs.forEach((input: HTMLInputElement): void => {
        const inputTable: HTMLTableElement | null = input.closest('table');
        const wrapperContainer: HTMLTableRowElement | null = inputTable ? inputTable.closest('tr')?.closest('table')?.closest('tr') ?? null : null;
        if (!wrapperContainer) {
          return;
        }

        const siteDetail: HTMLElement | null = wrapperContainer.querySelector<HTMLElement>('.table_detail');
        const containerNode: HTMLElement | null = wrapperContainer.querySelector<HTMLElement>('[id$="_Container"]');
        if (!siteDetail || !containerNode) {
          return;
        }

        const siteName: string = siteDetail.innerText.trim().split(':')[0];
        const siteId: string | undefined = activeSettings.siteIdByName[siteName];

        if (siteId) {
          const containerId: string = containerNode.id.split('_Container')[0];
          const siteValues: string[] = Array.from(wrapperContainer.querySelectorAll<HTMLInputElement>(`[name=${containerId}]`)).map((valueInput: HTMLInputElement): string => escapeXmlValue(valueInput.value));
          const effectiveValues: string[] = siteValues.filter(isEffectiveValue);
          if (effectiveValues.length === 0) {
            return;
          }

          const renderedValue: string = formatValues ? formatValues(effectiveValues) : effectiveValues[0];
          if (!isEffectiveValue(renderedValue)) {
            return;
          }

          siteSpecificXml += `${openingTag.replace('###', siteId)}${renderedValue}${closingTag}\n`;
        }
      });

      return siteSpecificXml;
    },

    async generic(items: ContentAssetItem[]): Promise<string> {
      const chunks: string[] = await Promise.all(
        renderers.cleanup(items).map(async (item: ContentAssetItem): Promise<string> => {
          const fieldTag: string = FIELD_TAG_MAP[item.id];

          if (item.siteSpecificUrl) {
            const defaultXml: string = isEffectiveValue(item.values[0]) ? `        <${fieldTag}>${item.values[0]}</${fieldTag}>\n` : '';
            const siteSpecificText: string = await renderers.getDataBySite(item.siteSpecificUrl, `        <${fieldTag} site-id="###">`, `</${fieldTag}>`);

            return defaultXml + siteSpecificText;
          }

          return `${item.id !== 'name' ? '    ' : '' }        <${fieldTag}${item.isLocalized ? ` xml:lang="${item.lang}">` : '>'}${item.values[0]}</${fieldTag}>\n`;
        })
      );

      return chunks.join('');
    },

    async page(items: ContentAssetItem[]): Promise<string> {
      return renderers.generic(items);
    },

    async custom(items: ContentAssetItem[]): Promise<string> {
      const chunks: string[] = await Promise.all(
        renderers.cleanup(items).map(async (item: ContentAssetItem): Promise<string> => {
          const effectiveValues: string[] = item.values.filter(isEffectiveValue);
          const value: string = formatCustomAttributeValues(effectiveValues);

          if (item.siteSpecificUrl) {
            const hasDefaultValue: boolean = effectiveValues.length > 0;
            const defaultXml: string = hasDefaultValue ? `            <custom-attribute attribute-id="${item.id}">${value}</custom-attribute>\n` : '';
            const siteSpecificText: string = await renderers.getDataBySite(item.siteSpecificUrl, `            <custom-attribute site-id="###" attribute-id="${item.id}">`, `</custom-attribute>`, formatCustomAttributeValues);

            return defaultXml + siteSpecificText;
          }

          return effectiveValues.length > 0 ? `            <custom-attribute attribute-id="${item.id}${item.isLocalized ? `" xml:lang="${item.lang}">` : '">'}${value}</custom-attribute>\n` : '';
        })
      );

      return chunks.join('');
    },

    folder(items: Element[]): string {
      return items
        .map((item: Element): string => {
          const parentNode: ParentNode | null = item.parentNode;
          const checkCellInput: HTMLInputElement | undefined = parentNode?.childNodes[6]?.childNodes[0] as HTMLInputElement | undefined;

          return `<${checkCellInput?.checked ? 'classification-link' : 'folder-link'} folder-id="${(item as HTMLElement).innerHTML.trim()}" />`;
        })
        .join('');
    },

    async sitemap(items: ContentAssetItem[]): Promise<string> {
      return renderers.generic(items);
    },
  };

  bootstrapContentAssetExport();

  function bootstrapContentAssetExport(): void {
    const extensionWindow: ContentAssetExportWindow = window as ContentAssetExportWindow;

    if (extensionWindow[WINDOW_FLAG]) {
      return;
    }

    extensionWindow[WINDOW_FLAG] = true;

    chrome.runtime.onMessage.addListener((message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: ContentAssetExportResponse) => void): boolean | void => {
      if (isContentAssetExportMessage(message)) {
        generateContentAsset(message.runId)
          .then((): void => {
            sendResponse({ success: true });
          })
          .catch((error: unknown): void => {
            console.error('Failed to generate content asset', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Unable to generate content asset.',
            });
          });

        return true;
      }

      if (!isContentAssetListExportMessage(message)) {
        return;
      }

      generateContentAssetList(message.runId, message.contentIds, message.concurrency, message.filename)
        .then((): void => {
          sendResponse({ success: true });
        })
        .catch((error: unknown): void => {
          console.error('Failed to generate content asset list', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unable to generate content asset list.',
          });
        });

      return true;
    });
  }

  async function generateContentAsset(runId: string): Promise<void> {
    reportProgress(runId, 2, 'Preparing export');
    const result: ContentAssetResult = await buildContentAsset(runId);
    reportProgress(runId, 96, 'Preparing download');
    const blob = new Blob([result.xml], { type: 'text/xml' });
    const button = document.createElement('a');

    button.textContent = 'Download';
    window.URL = window.URL || window.webkitURL;
    button.href = window.URL.createObjectURL(blob);
    button.download = `${result.filename}.xml`;
    button.dataset.loaded = 'true';
    button.style.pointerEvents = 'initial';
    button.click();
    reportProgress(runId, 100, 'Download started');
    console.log('Content asset generated and download initiated.');
  }

  async function generateContentAssetList(runId: string, contentIds: string[], concurrency: number, filename?: string): Promise<void> {
    const uniqueContentIds: string[] = normalizeContentIds(contentIds);

    if (uniqueContentIds.length === 0) {
      throw new Error('Missing content asset IDs.');
    }

    reportProgress(runId, 2, 'Reading list page');
    activeSettings = await readContentAssetSettings();
    const listContext: BuildContext = createBuildContext(document, window.location.href);
    const currentListForm: HTMLFormElement = getRequiredContentListForm(listContext.doc);
    const listPageUrl: string = new URL(currentListForm.getAttribute('action') || listContext.url, listContext.url).toString();
    let searchedItems = 0;
    let completedItems = 0;
    const itemLimiter: TaskLimiter = createTaskLimiter(concurrency);
    const fragmentTasks: Promise<ContentAssetFragment>[] = uniqueContentIds.map((contentId: string): Promise<ContentAssetFragment> => {
      return itemLimiter(async (): Promise<ContentAssetFragment> => {
        reportProgress(runId, getSearchProgress(searchedItems, uniqueContentIds.length), `Searching ${contentId}`);
        const detailUrl: string = await findContentAssetDetailUrl(listPageUrl, contentId);
        searchedItems += 1;
        reportProgress(runId, getSearchProgress(searchedItems, uniqueContentIds.length), `Found ${searchedItems}/${uniqueContentIds.length}`);
        const detailDoc: Document = await fetchHtmlDocument(detailUrl);
        const fragment: ContentAssetFragment = await buildContentAssetFragment(createBuildContext(detailDoc, detailUrl));

        completedItems += 1;
        reportProgress(runId, getBuildProgress(completedItems, uniqueContentIds.length), `Exported ${completedItems}/${uniqueContentIds.length}`);
        return fragment;
      });
    });

    const fragments: ContentAssetFragment[] = await Promise.all(fragmentTasks);

    reportProgress(runId, 94, 'Rendering XML');
    const libraryOpen: string = fragments[0]?.libraryOpen ?? '<library xmlns="http://www.demandware.com/xml/impex/library/2006-10-31">';
    const xml: string = renderLibraryXml(libraryOpen, fragments.map((fragment: ContentAssetFragment): string => fragment.contentXml).join('\n'));
    const exportFilename: string = normalizeExportFilename(filename) || (uniqueContentIds.length === 1 ? uniqueContentIds[0] : `content-assets-${formatTimestampForFilename(new Date())}`);

    downloadXml(xml, exportFilename);
    reportProgress(runId, 100, 'Download started');
    console.log('Content asset list generated and download initiated.');
  }

  async function buildContentAsset(runId: string): Promise<ContentAssetResult> {
    console.log('Building content asset...');
    reportProgress(runId, 6, 'Reading page setup');
    activeSettings = await readContentAssetSettings();
    const fragment: ContentAssetFragment = await buildContentAssetFragment(createBuildContext(document, window.location.href), runId);

    return {
      xml: renderLibraryXml(fragment.libraryOpen, fragment.contentXml),
      filename: fragment.contentId,
    };
  }

  async function buildContentAssetFragment(context: BuildContext, runId?: string): Promise<ContentAssetFragment> {
    const localeSelect: HTMLSelectElement = requireElementFromDocument(context.doc, '[name="LocaleId"]', HTMLSelectElement);
    const contentUUID: HTMLInputElement = requireElementFromDocument(context.doc, '[name="ContentUUID"]', HTMLInputElement);
    const localeForm: HTMLFormElement = requireElementFromDocument(context.doc, 'form[name="localeForm"]', HTMLFormElement);
    const localeOptions: HTMLOptionElement[] = Array.from(localeSelect.options)
      .filter((option: HTMLOptionElement): boolean => (activeSettings.allowedLocales.length ? activeSettings.allowedLocales.includes(option.value) : true))
      .sort((a: HTMLOptionElement, b: HTMLOptionElement): number => a.value.localeCompare(b.value));
    const localeFormAction: string = new URL(localeForm.getAttribute('action') || context.url, context.url).toString();
    const baseQuery = `?&ContentUUID=${contentUUID.value}&switch=switch&LocaleId=`;
    let completedLocales = 0;
    const localeRequests: Promise<LocalePage>[] = localeOptions.map((option: HTMLOptionElement): Promise<LocalePage> => {
      const url: string = `${localeFormAction || context.url}${baseQuery}${option.value}`;
      return fetch(url, { credentials: 'include' })
        .then((res: Response): Promise<string> => res.text())
        .then((html: string): LocalePage => {
          completedLocales += 1;
          if (runId) {
            reportProgress(runId, getLocaleFetchPercent(completedLocales, localeOptions.length), `Fetched locale ${completedLocales}/${localeOptions.length}`);
          }
          return { html, url };
        });
    });
    const localePages: LocalePage[] = await Promise.all(localeRequests);
    if (runId) {
      reportProgress(runId, 58, 'Parsing locale fields');
    }
    const grouped: ContentAssetGroups = buildGroupsFromLocalePages(localePages);
    if (runId) {
      reportProgress(runId, 72, 'Fetching library data');
    }
    const [libraryInfo, folderNodes]: [LibraryInfo, Element[]] = await Promise.all([fetchLibraryInfo(context), fetchFolderLinks(context)]);
    if (runId) {
      reportProgress(runId, 84, 'Rendering XML');
    }
    const foldersXml: string = renderers.folder(folderNodes);
    const libraryOpen: string = libraryInfo.shared && libraryInfo.xml ? libraryInfo.xml : '<library xmlns="http://www.demandware.com/xml/impex/library/2006-10-31">';
    const contentId: string = getContentId(context.doc);
    const groupedXml: string = await renderGroupedXml(grouped);

    return {
      contentId,
      contentXml: [`    <content content-id="${contentId}">\n`, groupedXml, '        <folder-links>\n', foldersXml !== '' ? `${foldersXml}\n` : '', '        </folder-links>\n', '    </content>\n'].join(''),
      libraryOpen,
    };
  }

  function getLocaleFetchPercent(completedLocales: number, totalLocales: number): number {
    if (totalLocales === 0) {
      return 55;
    }

    return Math.min(55, 10 + Math.round((completedLocales / totalLocales) * 45));
  }

  function getBatchProgress(completedItems: number, totalItems: number): number {
    if (totalItems === 0) {
      return 92;
    }

    return Math.min(92, 6 + Math.round((completedItems / totalItems) * 86));
  }

  function getSearchProgress(searchedItems: number, totalItems: number): number {
    if (totalItems === 0) {
      return 40;
    }

    return Math.min(40, 2 + Math.round((searchedItems / totalItems) * 38));
  }

  function getBuildProgress(completedItems: number, totalItems: number): number {
    if (totalItems === 0) {
      return 92;
    }

    return Math.min(92, 40 + Math.round((completedItems / totalItems) * 52));
  }

  function createBuildContext(doc: Document, url: string): BuildContext {
    return {
      doc,
      url,
      origin: new URL(url).origin,
    };
  }

  async function findContentAssetDetailUrl(listUrl: string, contentId: string): Promise<string> {
    const listDoc: Document = await fetchHtmlDocument(listUrl);
    const listForm: HTMLFormElement = getRequiredContentListForm(listDoc);
    const searchUrl: string = new URL(listForm.getAttribute('action') || listUrl, listUrl).toString();
    const body: URLSearchParams = createContentAssetSearchBody(listForm, contentId);
    const html: string = await fetch(searchUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    }).then((response: Response): Promise<string> => response.text());

    const doc: Document = new DOMParser().parseFromString(html, 'text/html');
    const table: HTMLTableElement | null = getContentListTable(doc);

    if (!table) {
      throw new Error(`Không tìm thấy result table: ${contentId}`);
    }

    const detailLink: HTMLAnchorElement | undefined = Array.from(table.querySelectorAll<HTMLAnchorElement>('a')).find((anchor: HTMLAnchorElement): boolean => {
      return normalizeText(anchor.innerText || anchor.textContent || '') === contentId;
    });
    const href: string | null = detailLink?.getAttribute('href') ?? null;

    if (!href) {
      throw new Error(`Không tìm thấy content asset: ${contentId}`);
    }

    return new URL(href, searchUrl).toString();
  }

  function createContentAssetSearchBody(form: HTMLFormElement, contentId: string): URLSearchParams {
    const params = new URLSearchParams();

    Array.from(form.elements).forEach((element: Element): void => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.name || element.disabled) {
        return;
      }

      if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type) && !element.checked) {
        return;
      }

      params.set(element.name, element.value);
    });

    params.set('SearchTerm', contentId);
    params.set('CurrentPageNumber', '0');

    if (!params.has('find')) {
      params.set('find', '');
    }

    return params;
  }

  function getContentListTable(doc: Document): HTMLTableElement | null {
    const form: HTMLFormElement | null = getContentListForm(doc);

    if (!form) {
      return null;
    }

    return form.closest('table') ?? form.querySelector<HTMLTableElement>('table') ?? Array.from(doc.querySelectorAll<HTMLTableElement>('table')).find((table: HTMLTableElement): boolean => table.contains(form)) ?? null;
  }

  function getRequiredContentListForm(doc: Document): HTMLFormElement {
    const form: HTMLFormElement | null = getContentListForm(doc);

    if (!form) {
      throw new Error('Mở đúng Content Asset list page.');
    }

    return form;
  }

  function getContentListForm(doc: Document): HTMLFormElement | null {
    const form: HTMLFormElement | null = doc.querySelector<HTMLFormElement>('form#ContentListForm[name="ContentListForm"]');

    if (!form) {
      return null;
    }

    const action: string = form.getAttribute('action') ?? '';
    const method: string = form.getAttribute('method') ?? '';
    const csrfToken: string | null = ensureContentListCsrfInput(doc, form);

    if (method.toUpperCase() !== 'POST' || !action.includes('ViewLibraryContentList') || !csrfToken) {
      return null;
    }

    return form;
  }

  function ensureContentListCsrfInput(doc: Document, form: HTMLFormElement): string | null {
    const csrfInput: HTMLInputElement | null = form.querySelector<HTMLInputElement>('input[name="csrf_token"]');

    if (csrfInput?.value) {
      return csrfInput.value;
    }

    const csrfToken: string | null = getCsrfTokenFromScripts(doc);

    if (!csrfToken) {
      return null;
    }

    const injectedInput: HTMLInputElement = doc.createElement('input');
    injectedInput.type = 'hidden';
    injectedInput.name = 'csrf_token';
    injectedInput.value = csrfToken;
    form.prepend(injectedInput);

    return csrfToken;
  }

  function getCsrfTokenFromScripts(doc: Document): string | null {
    const scripts: HTMLScriptElement[] = Array.from(doc.querySelectorAll<HTMLScriptElement>('script'));

    for (const script of scripts) {
      const text: string = script.textContent ?? '';
      const match: RegExpMatchArray | null = text.match(/new\s+CSRFInjector\s*\(\s*['"]csrf_token['"]\s*,\s*['"]([^'"]+)['"]/);

      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  function createTaskLimiter(concurrency: number): TaskLimiter {
    const normalizedConcurrency: number = Math.max(1, Math.floor(concurrency));
    const queue: Array<() => void> = [];
    let activeCount = 0;

    function runNext(): void {
      if (activeCount >= normalizedConcurrency) {
        return;
      }

      const nextTask: (() => void) | undefined = queue.shift();

      if (!nextTask) {
        return;
      }

      activeCount += 1;
      nextTask();
    }

    return async function limit<TResult>(task: () => Promise<TResult>): Promise<TResult> {
      return new Promise((resolve: (value: TResult) => void, reject: (reason?: unknown) => void): void => {
        queue.push((): void => {
          task()
            .then(resolve, reject)
            .finally((): void => {
              activeCount -= 1;
              runNext();
            });
        });

        runNext();
      });
    };
  }

  function downloadXml(xml: string, filename: string): void {
    const blob = new Blob([xml], { type: 'text/xml' });
    const button = document.createElement('a');

    button.textContent = 'Download';
    window.URL = window.URL || window.webkitURL;
    button.href = window.URL.createObjectURL(blob);
    button.download = `${filename}.xml`;
    button.dataset.loaded = 'true';
    button.style.pointerEvents = 'initial';
    button.click();
  }

  function normalizeContentIds(contentIds: string[]): string[] {
    return Array.from(
      new Set(
        contentIds
          .map((contentId: string): string => contentId.trim())
          .filter((contentId: string): boolean => contentId !== '')
      )
    );
  }

  function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  function formatTimestampForFilename(date: Date): string {
    const year: string = String(date.getFullYear());
    const month: string = String(date.getMonth() + 1).padStart(2, '0');
    const day: string = String(date.getDate()).padStart(2, '0');
    const hours: string = String(date.getHours()).padStart(2, '0');
    const minutes: string = String(date.getMinutes()).padStart(2, '0');
    const seconds: string = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
  }

  function normalizeExportFilename(filename: string | undefined): string {
    return (filename ?? '')
      .trim()
      .replace(/\.xml$/i, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-');
  }

  function renderLibraryXml(libraryOpen: string, contentXml: string): string {
    return ['<?xml version="1.0" encoding="UTF-8"?>\n', ensureTrailingNewline(libraryOpen), contentXml, contentXml.endsWith('\n') ? '' : '\n', '</library>'].join('');
  }

  function ensureTrailingNewline(value: string): string {
    return value.endsWith('\n') ? value : `${value}\n`;
  }

  async function readContentAssetSettings(): Promise<ContentAssetSettings> {
    return new Promise((resolve: (value: ContentAssetSettings) => void): void => {
      chrome.storage.local.get(CONTENT_ASSET_SETTINGS_STORAGE_KEY, (items: Record<string, unknown>): void => {
        if (chrome.runtime.lastError) {
          resolve(FerbToolsContentAssetConfig.createDefaultSettings());
          return;
        }

        resolve(normalizeContentAssetSettings(items[CONTENT_ASSET_SETTINGS_STORAGE_KEY]));
      });
    });
  }

  function normalizeContentAssetSettings(candidate: unknown): ContentAssetSettings {
    const defaults: ContentAssetSettings = FerbToolsContentAssetConfig.createDefaultSettings();

    if (!isRecord(candidate)) {
      return defaults;
    }

    return {
      allowedLocales: Array.isArray(candidate.allowedLocales) ? candidate.allowedLocales.filter((locale: unknown): locale is string => typeof locale === 'string' && locale.trim() !== '') : defaults.allowedLocales,
      siteIdByName: normalizeSiteIdMap(candidate.siteIdByName, defaults.siteIdByName),
      batchConcurrency: normalizeBatchConcurrency(candidate.batchConcurrency, defaults.batchConcurrency),
      listContentIdsText: typeof candidate.listContentIdsText === 'string' ? candidate.listContentIdsText : defaults.listContentIdsText,
      listFilename: typeof candidate.listFilename === 'string' ? candidate.listFilename : defaults.listFilename,
    };
  }

  function normalizeBatchConcurrency(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.min(10, Math.floor(value))) : fallback;
  }

  function normalizeSiteIdMap(candidate: unknown, fallback: Record<string, string>): Record<string, string> {
    if (!isRecord(candidate)) {
      return fallback;
    }

    const normalizedMap: Record<string, string> = {};

    Object.entries(candidate).forEach(([siteName, siteId]: [string, unknown]): void => {
      if (typeof siteId === 'string' && siteName.trim() !== '' && siteId.trim() !== '') {
        normalizedMap[siteName] = siteId;
      }
    });

    return Object.keys(normalizedMap).length ? normalizedMap : fallback;
  }

  function buildGroupsFromLocalePages(localePages: LocalePage[]): ContentAssetGroups {
    const parser = new DOMParser();
    const grouped: ContentAssetGroups = localePages.reduce((acc: ContentAssetGroups, localePage: LocalePage): ContentAssetGroups => {
      const doc: Document = parser.parseFromString(localePage.html, 'text/html');
      const tooltipNodes: NodeListOf<HTMLElement> = doc.querySelectorAll<HTMLElement>('[data-dw-tooltip]');
      const localeId: string = getDocumentInputValue(doc, 'LocaleId');
      const xmlLang: string = localeId === 'default' ? 'x-default' : localeId.replace('_', '-');

      tooltipNodes.forEach((node: HTMLElement): void => {
        const tooltip: string | undefined = node.dataset.dwTooltip;
        const attrUuid: string | undefined = node.dataset.dwAttruuid;

        if (!tooltip || !attrUuid) {
          return;
        }

        const parts: string[] = tooltip.split('.');

        if (parts[0] !== 'Content') {
          return;
        }

        const item: ContentAssetItem = {
          id: parts[1],
          lang: xmlLang,
          isLocalized: isLocalized(node),
          values: Array.from(doc.querySelectorAll<HTMLInputElement>(`[name=Meta${attrUuid}]`)).map((input: HTMLInputElement): string => escapeXmlValue(input.value)),
        };
        const siteSpecificUrl: string | null = getSiteSpecificUrl(node, localePage.url);

        if (siteSpecificUrl) {
          item.siteSpecificUrl = siteSpecificUrl;
        }

        addItemToGroups(acc, item);
      });

      return acc;
    }, createEmptyGroups());

    grouped.generic = sortNameDescriptionFirst(grouped.generic);

    GROUP_KEYS.forEach((key: ContentAssetGroupKey): void => {
      grouped[key] = grouped[key].sort((a: ContentAssetItem, b: ContentAssetItem): number => a.id.localeCompare(b.id));
    });

    return grouped;
  }

  function addItemToGroups(groups: ContentAssetGroups, item: ContentAssetItem): void {
    const id: string = item.id;

    if (!GENERIC_FIELDS.includes(id) && !SITEMAP_FIELDS.includes(id) && !PAGE_FIELDS.includes(id) && !hasNonLocalizedItem(groups.custom, id)) {
      groups.custom.push(item);
      return;
    }

    if (!PAGE_FIELDS.includes(id) || SITEMAP_FIELDS.includes(id) || hasNonLocalizedItem(groups.page, id)) {
      if (!GENERIC_FIELDS.includes(id) || SITEMAP_FIELDS.includes(id) || hasNonLocalizedItem(groups.generic, id) || IGNORED_FIELDS.includes(id)) {
        if (SITEMAP_FIELDS.includes(id) && !hasNonLocalizedItem(groups.sitemap, id)) {
          groups.sitemap.push(item);
        }

        return;
      }

      groups.generic.push(item);
      return;
    }

    groups.page.push(item);
  }

  function createEmptyGroups(): ContentAssetGroups {
    return {
      generic: [],
      page: [],
      custom: [],
      sitemap: [],
    };
  }

  function sortNameDescriptionFirst(items: ContentAssetItem[]): ContentAssetItem[] {
    const names: ContentAssetItem[] = items.filter((item: ContentAssetItem): boolean => item.id === 'name');
    const descriptions: ContentAssetItem[] = items.filter((item: ContentAssetItem): boolean => item.id === 'description');
    const rest: ContentAssetItem[] = items.filter((item: ContentAssetItem): boolean => item.id !== 'name' && item.id !== 'description');

    return [...names, ...descriptions, ...rest];
  }

  function hasNonLocalizedItem(items: ContentAssetItem[], id: string): boolean {
    return !!items.find((item: ContentAssetItem): boolean => item.id === id && !item.isLocalized);
  }

  function getParameterByName(name: string, url?: string): string | null {
    const source: string = url || window.location.href;
    const safeName: string = name.replace(/[\[\]]/g, '\\$&');
    const regex = new RegExp(`[?&]${safeName}(=([^&#]*)|&|#|$)`);
    const results: RegExpExecArray | null = regex.exec(source);

    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
  }

  function isModernBmUi(doc: Document): boolean {
    return !!doc.getElementById('siteselect_select');
  }

  function getMerchantToolsSelectedSiteName(doc: Document): string | null {
    const siteSelect: HTMLElement | null = doc.getElementById('siteselect_select');
    if (siteSelect) {
      const valueNode: HTMLElement | null = siteSelect.querySelector<HTMLElement>('.slds-combobox__input-value');
      if (valueNode && valueNode.textContent?.trim()) {
        return valueNode.textContent.trim();
      }
    }
    return null;
  }

  async function fetchFolderLinks(context: BuildContext): Promise<Element[]> {
    const url: string = context.url.replace('ViewLibraryContent', 'ViewLibraryContentFolders').replace('-Dispatch', '-Start');
    const nextUrl = new URL(url);
    const contentUUID: HTMLInputElement = requireElementFromDocument(context.doc, '[name=ContentUUID]', HTMLInputElement);

    nextUrl.search = new URLSearchParams([['ContentUUID', contentUUID.value]]).toString();

    const doc: Document = await fetchHtmlDocument(nextUrl.toString());
    return Array.from(doc.querySelectorAll('.table_detail.e.s.bold'));
  }

  async function fetchLibraryInfo(context: BuildContext): Promise<LibraryInfo> {
    const selected: HTMLCollectionOf<Element> = context.doc.getElementsByClassName('sod_option selected active ');
    let repositoryUuid: string | null = selected.length ? (selected[0] as HTMLElement).innerText : null;

    if (isModernBmUi(context.doc)) {
      repositoryUuid = getMerchantToolsSelectedSiteName(context.doc);
    }

    const csrfToken: string | null = getParameterByName('csrf_token', context.url);
    const url = new URL(`${context.origin}${FerbToolsContentAssetConfig.BM_URLS.libraries}`);

    url.searchParams.set('RepositoryUUID', repositoryUuid ?? '');
    url.searchParams.set('csrf_token', csrfToken ?? '');

    const doc: Document = await fetchHtmlDocument(url.toString());
    const detailNodes: HTMLElement[] = Array.from(doc.querySelectorAll<HTMLElement>('.table_detail:not(.bold)'));
    const selectedNode: HTMLElement | undefined = detailNodes.find((node: HTMLElement): boolean => node.innerHTML.includes(repositoryUuid ?? ''));

    if (!selectedNode || !selectedNode.parentElement?.children) {
      return { shared: false };
    }

    const rowChildren: HTMLCollection = selectedNode.parentElement.children;
    const libraryType: string = (rowChildren[1] as HTMLElement).innerText;

    return libraryType.indexOf('Shared') > -1
      ? {
          xml: `<library xmlns="http://www.demandware.com/xml/impex/library/2006-10-31" library-id="${(rowChildren[0] as HTMLElement).innerText.trim()}">\n`,
          shared: true,
        }
      : { shared: false };
  }

  function isLocalized(fieldNode: Element): boolean {
    const firstCell: Element | undefined = Array.from(fieldNode.parentElement?.children ?? [])[0];
    return !!(firstCell?.hasAttribute('title') && firstCell.getAttribute('title') === 'Localized');
  }

  function isSiteSpecific(fieldNode: Element): boolean {
    const firstCell: Element | undefined = Array.from(fieldNode.parentElement?.children ?? [])[0];
    return !!(firstCell?.hasAttribute('title') && firstCell.getAttribute('title') === 'Site-Specific');
  }

  async function renderGroupedXml(groups: ContentAssetGroups): Promise<string> {
    const chunks: string[] = await Promise.all(
      GROUP_KEYS.map(async (key: ContentAssetGroupKey): Promise<string> => {
        const wrapper: XmlWrapper = XML_WRAPPERS[key];
        const xml: string = await renderers[key](groups[key]);
        return xml !== '' ? wrapper.opening + xml + wrapper.closing : '';
      })
    );

    return chunks.join('');
  }

  async function fetchHtmlDocument(url: string): Promise<Document> {
    const html: string = await fetch(url, { credentials: 'include' }).then((res: Response): Promise<string> => res.text());
    return new DOMParser().parseFromString(html, 'text/html');
  }

  function getDocumentInputValue(doc: Document, name: string): string {
    const input: HTMLInputElement | null = doc.querySelector<HTMLInputElement>(`[name="${name}"]`);
    return input?.value ?? '';
  }

  function getSiteSpecificUrl(node: Element, baseUrl: string): string | null {
    if (!isSiteSpecific(node)) {
      return null;
    }

    const tableNode: HTMLTableElement | null = node.closest('table');
    const rowNode: HTMLTableRowElement | null = tableNode ? tableNode.closest('tr') : null;
    const showAllLink: HTMLAnchorElement | null = rowNode ? rowNode.querySelector<HTMLAnchorElement>('.ssa_show_all a') : null;
    const onclickValue: string | null = showAllLink ? showAllLink.getAttribute('onclick') : null;
    const urlMatch: RegExpMatchArray | null = onclickValue ? onclickValue.match(/'([^']+)'/) : null;

    return urlMatch ? new URL(urlMatch[1], baseUrl).toString() : null;
  }

  function getContentId(doc: Document): string {
    const detailNode: Element | undefined = doc.getElementsByClassName('table_detail')[0];
    const contentInput: HTMLInputElement | undefined = detailNode?.childNodes[1] as HTMLInputElement | undefined;

    if (!contentInput?.value) {
      throw new Error('Unable to detect content asset ID.');
    }

    return contentInput.value;
  }

  function requireElementFromDocument<TElement extends Element>(doc: Document, selector: string, constructor: { new (): TElement }): TElement {
    const element: Element | null = doc.querySelector(selector);

    if (!(element instanceof constructor)) {
      throw new Error(`Missing element: ${selector}`);
    }

    return element;
  }

  function escapeXmlValue(value: string): string {
    return value
      .replace(/&/gi, '&amp;')
      .replace(/</gi, '&lt;')
      .replace(/\r\n|\r|\n/g, '&#13;\n')
      .replace(/>/gi, '&gt;');
  }

  function isEffectiveValue(value: string | undefined): value is string {
    return value !== undefined && value !== '' && value !== '_NONE_';
  }

  function formatCustomAttributeValues(values: string[]): string {
    return values.length <= 1
      ? values[0] || ''
      : '\n' +
          values
            .map((value: string): string => `<value>${value}</value>`)
            .map((value: string): string => '                ' + value)
            .join('\n') +
          '\n            ';
  }

  function isContentAssetExportMessage(message: unknown): message is ContentAssetExportMessage {
    return typeof message === 'object' && message !== null && (message as Record<string, unknown>).type === 'RUN_CONTENT_ASSET_EXPORT' && typeof (message as Record<string, unknown>).runId === 'string';
  }

  function isContentAssetListExportMessage(message: unknown): message is ContentAssetListExportMessage {
    return (
      isRecord(message) &&
      message.type === 'RUN_CONTENT_ASSET_LIST_EXPORT' &&
      typeof message.runId === 'string' &&
      Array.isArray(message.contentIds) &&
      message.contentIds.every((contentId: unknown): contentId is string => typeof contentId === 'string') &&
      typeof message.concurrency === 'number' &&
      (message.filename === undefined || typeof message.filename === 'string')
    );
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function reportProgress(runId: string, percent: number, label: string): void {
    void chrome.runtime.sendMessage({
      type: 'CONTENT_ASSET_EXPORT_PROGRESS',
      runId,
      percent,
      label,
    } satisfies ContentAssetExportProgressMessage);
  }
}
