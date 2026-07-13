(() => {
  const bmUrls = {
    libraries: '/on/demandware.store/Sites-Site/default/ViewContentSharedLibrary-List?SelectedMenuItem=content&CurrentMenuItemId=content',
  };

  const fieldTagMap = {
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

  const siteIdByName = {
    'TUMI Australia': 'Tumi_AU',
    'TUMI Hong Kong': 'Tumi_HK',
    'TUMI Indonesia': 'Tumi_ID',
    'TUMI Japan': 'Tumi_JP',
    'TUMI Korea': 'Tumi_KR',
    'TUMI Malaysia': 'Tumi_MY',
    'TUMI Singapore': 'Tumi_SG',
    'TUMI Thailand': 'Tumi_TH',
    'TUMI Taiwan': 'Tumi_TW',
  };

  const allowedLocales = ['default', 'zh_HK', 'zh_TW', 'en_AU', 'en_HK', 'en_ID', 'en_MY', 'en_SG', 'en_TH', 'in_ID', 'ja_JP', 'ko_KR', 'th_TH'];

  const xmlWrappers = {
    page: { opening: '<page-attributes>', closing: '</page-attributes>' },
    custom: { opening: '        <custom-attributes>\n', closing: '        </custom-attributes>\n' },
    folder: { opening: '<folder-links>', closing: '</folder-links>' },
    generic: { opening: '', closing: '' },
    sitemap: { opening: '', closing: '' },
  };

  const genericFields = ['ID', 'name', 'description', 'onlineFlag', 'searchableFlag', 'pageTitle', 'pageDescription', 'pageKeywords', 'pageURL', 'template'];

  const sitemapFields = ['siteMapIncluded', 'siteMapChangeFrequency', 'siteMapPriority'];

  const pageFields = ['pageTitle', 'pageDescription', 'pageKeywords', 'pageURL'];

  const ignoredFields = ['ID'];

  const renderers = {
    cleanup(items) {
      return items.filter((item) => {
        if (item.siteSpecificUrl) return true;
        return item.values.filter((v) => v !== '' && v !== '_NONE_').length > 0;
      });
    },

    async getDataBySite(url, openingTag, closingTag, formatValues) {
      let siteSpecificXml = '';
      const html = await fetch(url, { credentials: 'include' }).then((res) => res.text());
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const uncheckedInputs = doc.querySelectorAll('input[type="checkbox"]:not(:checked)');

      uncheckedInputs.forEach((input) => {
        const inputTable = input.closest('table');
        const wrapperContainer = inputTable ? inputTable.closest('tr')?.closest('table')?.closest('tr') : null;
        if (!wrapperContainer) {
          return;
        }

        const siteDetail = wrapperContainer.querySelector('.table_detail');
        const containerNode = wrapperContainer.querySelector('[id$="_Container"]');
        if (!siteDetail || !containerNode) {
          return;
        }

        const siteName = siteDetail.innerText.trim().split(':')[0];
        const siteId = siteIdByName[siteName];

        if (siteId) {
          const containerId = containerNode.id.split('_Container')[0];
          const siteValues = Array.from(wrapperContainer.querySelectorAll(`[name=${containerId}]`)).map((input) =>
            input.value
              .replace(/&/gi, '&amp;')
              .replace(/</gi, '&lt;')
              .replace(/\r\n|\r|\n/g, '&#13;\n')
              .replace(/>/gi, '&gt;')
          );
          const effectiveValues = siteValues.filter((value) => value !== '' && value !== '_NONE_');
          if (effectiveValues.length === 0) {
            return;
          }

          const renderedValue = formatValues ? formatValues(effectiveValues) : effectiveValues[0];
          if (renderedValue === '' || renderedValue === '_NONE_') {
            return;
          }

          siteSpecificXml += `${openingTag.replace('###', siteId)}${renderedValue}${closingTag}\n`;
        }
      });

      return siteSpecificXml;
    },

    async generic(items) {
      const chunks = await Promise.all(
        renderers.cleanup(items).map(async (item) => {
          if (item.siteSpecificUrl) {
            let defaultXml = item.values[0] !== '' && item.values[0] !== '_NONE_' ? `        <${fieldTagMap[item.id]}>${item.values[0]}</${fieldTagMap[item.id]}>\n` : '';
            const siteSpecificText = await renderers.getDataBySite(item.siteSpecificUrl, `        <${fieldTagMap[item.id]} site-id="###">`, `</${fieldTagMap[item.id]}>`);

            return defaultXml + siteSpecificText;
          }

          return `        <${fieldTagMap[item.id]}${item.isLocalized ? ` xml:lang="${item.lang}">` : '>'}${item.values[0]}</${fieldTagMap[item.id]}>\n`;
        })
      );

      return chunks.join('');
    },

    async page(items) {
      return renderers.generic(items);
    },

    async custom(items) {
      const chunks = await Promise.all(
        renderers.cleanup(items).map(async (item) => {
          const effectiveValues = item.values.filter((v) => v !== '' && v !== '_NONE_');
          const value =
            effectiveValues.length <= 1
              ? effectiveValues[0] || ''
              : '\n' +
                effectiveValues
                  .map((v) => `<value>${v}</value>`)
                  .map((v) => '                ' + v)
                  .join('\n') +
                '\n            ';

          if (item.siteSpecificUrl) {
            const hasDefaultValue = effectiveValues.length > 0;
            const defaultXml = hasDefaultValue ? `            <custom-attribute attribute-id="${item.id}">${value}</custom-attribute>\n` : '';
            const siteSpecificText = await renderers.getDataBySite(item.siteSpecificUrl, `            <custom-attribute site-id="###" attribute-id="${item.id}">`, `</custom-attribute>`, function (values) {
              return values.length === 1
                ? values[0]
                : '\n' +
                    values
                      .map((v) => `<value>${v}</value>`)
                      .map((v) => '                ' + v)
                      .join('\n') +
                    '\n            ';
            });

            return defaultXml + siteSpecificText;
          }

          return effectiveValues.length > 0 ? `            <custom-attribute attribute-id="${item.id}${item.isLocalized ? `" xml:lang="${item.lang}">` : '">'}${value}</custom-attribute>\n` : '';
        })
      );

      return chunks.join('');
    },

    folder(items) {
      return items
        .map((item) => {
          return `<${item.parentNode.childNodes[6].childNodes[0].checked ? 'classification-link' : 'folder-link'} folder-id="${item.innerHTML.trim()}" />`;
        })
        .join('');
    },

    async sitemap(items) {
      return renderers.generic(items);
    },
  };

  function hasNonLocalizedItem(items, id) {
    return !!items.find((item) => item.id === id && !item.isLocalized);
  }

  function getParameterByName(name, url) {
    const source = url || window.location.href;
    const safeName = name.replace(/[\[\]]/g, '\\$&');
    const regex = new RegExp(`[?&]${safeName}(=([^&#]*)|&|#|$)`);
    const results = regex.exec(source);

    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
  }

  function isModernBmUi() {
    return !!document.getElementById('siteselect_select');
  }

  function getMerchantToolsSelectedSiteName() {
    const siteSelect = document.getElementById('siteselect_select');
    if (siteSelect) {
      const valueNode = siteSelect.querySelector('.slds-combobox__input-value');
      if (valueNode && valueNode.textContent.trim()) {
        return valueNode.textContent.trim();
      }
    }
    return null;
  }

  function fetchFolderLinks() {
    const url = window.location.href.replace('ViewLibraryContent', 'ViewLibraryContentFolders').replace('-Dispatch', '-Start');

    return new Promise((resolve) => {
      const nextUrl = new URL(url);
      const contentUUID = document.querySelector('[name=ContentUUID]');

      nextUrl.search = new URLSearchParams([['ContentUUID', contentUUID.value]]).toString();

      fetch(nextUrl, { credentials: 'include' })
        .then((res) => res.text())
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          resolve([...doc.querySelectorAll('.table_detail.e.s.bold')]);
        });
    });
  }

  function fetchLibraryInfo() {
    const selected = document.getElementsByClassName('sod_option selected active ');
    let repositoryUuid = null;

    repositoryUuid = selected.length ? selected[0].innerText : null;

    if (isModernBmUi()) {
      repositoryUuid = getMerchantToolsSelectedSiteName();
    }

    let result = {};

    return new Promise((resolve) => {
      const csrfToken = getParameterByName('csrf_token', window.location.href);
      const url = new URL(`${window.location.origin}${bmUrls.libraries}`);

      url.searchParams.set('RepositoryUUID', repositoryUuid);
      url.searchParams.set('csrf_token', csrfToken);

      fetch(url.toString(), { credentials: 'include' })
        .then((res) => res.text())
        .then((html) => {
          const detailNodes = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.table_detail:not(.bold)')];
          const selectedNode = detailNodes.find((node) => node.innerHTML.includes(repositoryUuid));

          if (!selectedNode || !selectedNode.parentNode || !selectedNode.parentNode.children) {
            resolve({ shared: false });
            return;
          }

          const rowChildren = selectedNode.parentNode.children;

          result =
            rowChildren[1].innerText.indexOf('Shared') > -1
              ? {
                  xml: `<library xmlns="http://www.demandware.com/xml/impex/library/2006-10-31" library-id="${rowChildren[0].innerText.trim()}">\n`,
                  shared: true,
                }
              : { shared: false };

          resolve(result);
        });
    });
  }

  function isLocalized(fieldNode) {
    const firstCell = Array.from(fieldNode.parentElement.children)[0];
    return !!(firstCell.hasAttribute('title') && firstCell.title === 'Localized');
  }

  function isSiteSpecific(fieldNode) {
    const firstCell = Array.from(fieldNode.parentElement.children)[0];
    return !!(firstCell.hasAttribute('title') && firstCell.title === 'Site-Specific');
  }

  async function renderGroupedXml(groups) {
    const chunks = await Promise.all(
      Object.keys(groups).map(async (key) => {
        const wrapper = xmlWrappers[key];
        const xml = await renderers[key].call(this, groups[key]);
        return xml !== '' ? wrapper.opening + xml + wrapper.closing : '';
      })
    );

    return chunks.join('');
  }

  function buildContentAsset() {
    console.log('Building content asset...');
    const localeSelect = document.querySelector('[name="LocaleId"]');
    const contentUUID = document.querySelector('[name="ContentUUID"]');
    const localeForm = document.querySelector('form[name="localeForm"]');
    const localeOptions = [...localeSelect.options].filter((option) => (allowedLocales.length ? allowedLocales.includes(option.value) : true)).sort((a, b) => a.value.localeCompare(b.value));
    const localeFormAction = localeForm.action;
    const baseQuery = `?&ContentUUID=${contentUUID.value}&switch=switch&LocaleId=`;

    let xmlLang;

    const localeRequests = localeOptions.map((option) => fetch(`${localeFormAction}${baseQuery}${option.value}`, { credentials: 'include' }).then((res) => res.text()));

    return new Promise((resolve) => {
      Promise.all(localeRequests)
        .then((htmlPages) => {
          const parser = new DOMParser();
          const grouped = htmlPages.reduce(
            (acc, html) => {
              const doc = parser.parseFromString(html, 'text/html');
              const tooltipNodes = doc.querySelectorAll('[data-dw-tooltip]');
              const localeId = doc.getElementsByName('LocaleId')[0].value;

              xmlLang = localeId === 'default' ? 'x-default' : localeId.replace('_', '-');

              tooltipNodes.forEach((node) => {
                const parts = node.dataset.dwTooltip.split('.');

                if (parts[0] === 'Content') {
                  const id = parts[1];
                  const item = {
                    id,
                    lang: xmlLang,
                    isLocalized: isLocalized(node),
                    values: Array.from(doc.querySelectorAll(`[name=Meta${node.dataset.dwAttruuid}]`)).map((input) =>
                      input.value
                        .replace(/&/gi, '&amp;')
                        .replace(/</gi, '&lt;')
                        .replace(/\r\n|\r|\n/g, '&#13;\n')
                        .replace(/>/gi, '&gt;')
                    ),
                  };

                  if (isSiteSpecific(node)) {
                    const tableNode = node.closest('table');
                    const rowNode = tableNode ? tableNode.closest('tr') : null;
                    const showAllLink = rowNode ? rowNode.querySelector('.ssa_show_all a') : null;
                    const onclickValue = showAllLink ? showAllLink.getAttribute('onclick') : null;
                    const urlMatch = onclickValue ? onclickValue.match(/'([^']+)'/) : null;
                    const url = urlMatch ? urlMatch[1] : null;

                    if (url) {
                      item.siteSpecificUrl = url;
                    }
                  }

                  if (!genericFields.includes(id) && !sitemapFields.includes(id) && !pageFields.includes(id) && !hasNonLocalizedItem(acc.custom, id)) {
                    acc.custom.push(item);
                  } else if (!pageFields.includes(id) || sitemapFields.includes(id) || hasNonLocalizedItem(acc.page, id)) {
                    if (!genericFields.includes(id) || sitemapFields.includes(id) || hasNonLocalizedItem(acc.generic, id) || ignoredFields.includes(id)) {
                      if (sitemapFields.includes(id) && !hasNonLocalizedItem(acc.sitemap, id)) {
                        acc.sitemap.push(item);
                      }
                    } else {
                      acc.generic.push(item);
                    }
                  } else {
                    acc.page.push(item);
                  }
                }
              });

              return acc;
            },
            { generic: [], page: [], custom: [], sitemap: [] }
          );

          const names = grouped.generic.filter((item) => item.id === 'name');
          const descriptions = grouped.generic.filter((item) => item.id === 'description');
          const rest = grouped.generic.filter((item) => item.id !== 'name' && item.id !== 'description');

          grouped.generic = [...names, ...descriptions, ...rest];

          Object.keys(grouped).forEach((key) => {
            grouped[key] = grouped[key].sort((a, b) => a.id.localeCompare(b.id));
          });

          return grouped;
        })
        .then((grouped) => {
          Promise.all([fetchLibraryInfo(), fetchFolderLinks()]).then(async (results) => {
            const [libraryInfo, folderNodes] = results;
            const foldersXml = renderers.folder(folderNodes);
            const libraryOpen = libraryInfo.shared ? libraryInfo.xml : '<library xmlns="http://www.demandware.com/xml/impex/library/2006-10-31">';
            const contentId = document.getElementsByClassName('table_detail')[0].childNodes[1].value;
            const groupedXml = await renderGroupedXml(grouped);

            const rawXml = ['<?xml version="1.0" encoding="UTF-8"?>\n', libraryOpen, `    <content content-id="${contentId}">\n`, groupedXml, '        <folder-links>\n', foldersXml !== '' ? `${foldersXml}\n` : '', '        </folder-links>\n', '    </content>\n', '</library>'].join('');

            resolve({
              xml: rawXml,
              filename: contentId,
            });
          });
        });
    });
  }

  window.generateContentAsset = () => {
    buildContentAsset().then((result) => {
      const blob = new Blob([result.xml], { type: 'text/xml' });
      const button = document.createElement('a');

      button.textContent = 'Download';
      window.URL = window.URL || window.webkitURL;
      button.href = window.URL.createObjectURL(blob);
      button.download = `${result.filename}.xml`;
      button.dataset.loaded = true;
      button.style.pointerEvents = 'initial';
      button.click();
      console.log('Content asset generated and download initiated.');
    });
  };

  generateContentAsset();
})();
