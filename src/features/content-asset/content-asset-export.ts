namespace FerbToolsContentAssetExport {
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

  interface XmlWrapper {
    opening: string;
    closing: string;
  }

  type SiteValueFormatter = (values: string[]) => string;
  type Renderer = (items: ContentAssetItem[]) => Promise<string> | string;

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
        const siteId: string | undefined = FerbToolsContentAssetConfig.SITE_ID_BY_NAME[siteName];

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

          return `            <${fieldTag}${item.isLocalized ? ` xml:lang="${item.lang}">` : '>'}${item.values[0]}</${fieldTag}>\n`;
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

  chrome.runtime.onMessage.addListener((message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: ContentAssetExportResponse) => void): boolean | void => {
    if (!isContentAssetExportMessage(message)) {
      return;
    }

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
  });

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

  async function buildContentAsset(runId: string): Promise<ContentAssetResult> {
    console.log('Building content asset...');
    reportProgress(runId, 6, 'Reading page setup');
    const localeSelect: HTMLSelectElement = requireElement('[name="LocaleId"]', HTMLSelectElement);
    const contentUUID: HTMLInputElement = requireElement('[name="ContentUUID"]', HTMLInputElement);
    const localeForm: HTMLFormElement = requireElement('form[name="localeForm"]', HTMLFormElement);
    const localeOptions: HTMLOptionElement[] = Array.from(localeSelect.options)
      .filter((option: HTMLOptionElement): boolean => (FerbToolsContentAssetConfig.ALLOWED_LOCALES.length ? FerbToolsContentAssetConfig.ALLOWED_LOCALES.includes(option.value as (typeof FerbToolsContentAssetConfig.ALLOWED_LOCALES)[number]) : true))
      .sort((a: HTMLOptionElement, b: HTMLOptionElement): number => a.value.localeCompare(b.value));
    const localeFormAction: string = localeForm.action;
    const baseQuery = `?&ContentUUID=${contentUUID.value}&switch=switch&LocaleId=`;
    let completedLocales = 0;
    const localeRequests: Promise<string>[] = localeOptions.map((option: HTMLOptionElement): Promise<string> => {
      return fetch(`${localeFormAction}${baseQuery}${option.value}`, { credentials: 'include' })
        .then((res: Response): Promise<string> => res.text())
        .then((html: string): string => {
          completedLocales += 1;
          reportProgress(runId, getLocaleFetchPercent(completedLocales, localeOptions.length), `Fetched locale ${completedLocales}/${localeOptions.length}`);
          return html;
        });
    });
    const htmlPages: string[] = await Promise.all(localeRequests);
    reportProgress(runId, 58, 'Parsing locale fields');
    const grouped: ContentAssetGroups = buildGroupsFromLocalePages(htmlPages);
    reportProgress(runId, 72, 'Fetching library data');
    const [libraryInfo, folderNodes]: [LibraryInfo, Element[]] = await Promise.all([fetchLibraryInfo(), fetchFolderLinks()]);
    reportProgress(runId, 84, 'Rendering XML');
    const foldersXml: string = renderers.folder(folderNodes);
    const libraryOpen: string = libraryInfo.shared && libraryInfo.xml ? libraryInfo.xml : '<library xmlns="http://www.demandware.com/xml/impex/library/2006-10-31">';
    const contentId: string = getContentId();
    const groupedXml: string = await renderGroupedXml(grouped);
    const rawXml: string = ['<?xml version="1.0" encoding="UTF-8"?>\n', libraryOpen, `    <content content-id="${contentId}">\n`, groupedXml, '        <folder-links>\n', foldersXml !== '' ? `${foldersXml}\n` : '', '        </folder-links>\n', '    </content>\n', '</library>'].join('');

    return {
      xml: rawXml,
      filename: contentId,
    };
  }

  function getLocaleFetchPercent(completedLocales: number, totalLocales: number): number {
    if (totalLocales === 0) {
      return 55;
    }

    return Math.min(55, 10 + Math.round((completedLocales / totalLocales) * 45));
  }

  function buildGroupsFromLocalePages(htmlPages: string[]): ContentAssetGroups {
    const parser = new DOMParser();
    const grouped: ContentAssetGroups = htmlPages.reduce((acc: ContentAssetGroups, html: string): ContentAssetGroups => {
      const doc: Document = parser.parseFromString(html, 'text/html');
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
        const siteSpecificUrl: string | null = getSiteSpecificUrl(node);

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

  function isModernBmUi(): boolean {
    return !!document.getElementById('siteselect_select');
  }

  function getMerchantToolsSelectedSiteName(): string | null {
    const siteSelect: HTMLElement | null = document.getElementById('siteselect_select');
    if (siteSelect) {
      const valueNode: HTMLElement | null = siteSelect.querySelector<HTMLElement>('.slds-combobox__input-value');
      if (valueNode && valueNode.textContent?.trim()) {
        return valueNode.textContent.trim();
      }
    }
    return null;
  }

  async function fetchFolderLinks(): Promise<Element[]> {
    const url: string = window.location.href.replace('ViewLibraryContent', 'ViewLibraryContentFolders').replace('-Dispatch', '-Start');
    const nextUrl = new URL(url);
    const contentUUID: HTMLInputElement = requireElement('[name=ContentUUID]', HTMLInputElement);

    nextUrl.search = new URLSearchParams([['ContentUUID', contentUUID.value]]).toString();

    const doc: Document = await fetchHtmlDocument(nextUrl.toString());
    return Array.from(doc.querySelectorAll('.table_detail.e.s.bold'));
  }

  async function fetchLibraryInfo(): Promise<LibraryInfo> {
    const selected: HTMLCollectionOf<Element> = document.getElementsByClassName('sod_option selected active ');
    let repositoryUuid: string | null = selected.length ? (selected[0] as HTMLElement).innerText : null;

    if (isModernBmUi()) {
      repositoryUuid = getMerchantToolsSelectedSiteName();
    }

    const csrfToken: string | null = getParameterByName('csrf_token', window.location.href);
    const url = new URL(`${window.location.origin}${FerbToolsContentAssetConfig.BM_URLS.libraries}`);

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

  function getSiteSpecificUrl(node: Element): string | null {
    if (!isSiteSpecific(node)) {
      return null;
    }

    const tableNode: HTMLTableElement | null = node.closest('table');
    const rowNode: HTMLTableRowElement | null = tableNode ? tableNode.closest('tr') : null;
    const showAllLink: HTMLAnchorElement | null = rowNode ? rowNode.querySelector<HTMLAnchorElement>('.ssa_show_all a') : null;
    const onclickValue: string | null = showAllLink ? showAllLink.getAttribute('onclick') : null;
    const urlMatch: RegExpMatchArray | null = onclickValue ? onclickValue.match(/'([^']+)'/) : null;

    return urlMatch ? urlMatch[1] : null;
  }

  function getContentId(): string {
    const detailNode: Element | undefined = document.getElementsByClassName('table_detail')[0];
    const contentInput: HTMLInputElement | undefined = detailNode?.childNodes[1] as HTMLInputElement | undefined;

    if (!contentInput?.value) {
      throw new Error('Unable to detect content asset ID.');
    }

    return contentInput.value;
  }

  function requireElement<TElement extends Element>(selector: string, constructor: { new (): TElement }): TElement {
    const element: Element | null = document.querySelector(selector);

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

  function reportProgress(runId: string, percent: number, label: string): void {
    void chrome.runtime.sendMessage({
      type: 'CONTENT_ASSET_EXPORT_PROGRESS',
      runId,
      percent,
      label,
    } satisfies ContentAssetExportProgressMessage);
  }
}
