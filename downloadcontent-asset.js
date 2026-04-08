(() => {
  const bmUrl = {
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

  const wrappers = {
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
      return items.filter((item) => item.values.filter((v) => v !== '' && v !== '_NONE_').length > 0);
    },

    generic(items) {
      return renderers
        .cleanup(items)
        .map((item) => {
          return `        <${fieldTagMap[item.id]}${item.isLocalized ? ` xml:lang="${item.lang}">` : '>'}${item.values[0]}</${fieldTagMap[item.id]}>\n`;
        })
        .join('');
    },

    page(items) {
      return renderers.generic(items);
    },

    custom(items) {
      return renderers
        .cleanup(items)
        .map((item) => {
          const value = item.values.length === 1 ? item.values[0] : item.values.map((v) => `<value>${v}</value>`).join('');

          return `            <custom-attribute attribute-id="${item.id}${item.isLocalized ? `" xml:lang="${item.lang}">` : '">'}${value}</custom-attribute>\n`;
        })
        .join('');
    },

    folder(items) {
      return items
        .map((item) => {
          return `<${item.parentNode.childNodes[6].childNodes[0].checked ? 'classification-link' : 'folder-link'} folder-id="${item.innerHTML.trim()}" />`;
        })
        .join('');
    },

    sitemap(items) {
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
    let repositoryUUID = null;

    repositoryUUID = selected.length ? selected[0].innerText : null;

    if (isModernBmUi()) {
      repositoryUUID = getMerchantToolsSelectedSiteName();
    }

    let result = {};

    return new Promise((resolve) => {
      const csrfToken = getParameterByName('csrf_token', window.location.href);
      const url = new URL(`${window.location.origin}${bmUrl.libraries}`);

      url.searchParams.set('RepositoryUUID', repositoryUUID);
      url.searchParams.set('csrf_token', csrfToken);

      fetch(url.toString(), { credentials: 'include' })
        .then((res) => res.text())
        .then((html) => {
          const rowChildren = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.table_detail:not(.bold)')].find((node) => node.innerHTML.includes(repositoryUUID)).parentNode.children;

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

  function renderGroupedXml(groups) {
    return Object.keys(groups).reduce((result, key) => {
      const wrapper = wrappers[key];
      const xml = renderers[key].call(this, groups[key]);
      const xmlText = xml !== '' ? wrapper.opening + xml + wrapper.closing : '';
      return result + xmlText;
    }, '');
  }

  function buildContentAsset() {
    console.log('Building content asset...');
    const localeSelect = document.querySelector('[name="LocaleId"]');
    const contentUUID = document.querySelector('[name="ContentUUID"]');
    const localeForm = document.querySelector('form[name="localeForm"]');
    const localeOptions = [...localeSelect.options];
    const action = localeForm.action;
    const baseQuery = `?&ContentUUID=${contentUUID.value}&switch=switch&LocaleId=`;

    let xmlLang;

    const requests = localeOptions.map((option) => fetch(`${action}${baseQuery}${option.value}`, { credentials: 'include' }).then((res) => res.text()));

    return new Promise((resolve) => {
      Promise.all(requests)
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
                    isSiteSpecific: isSiteSpecific(node),
                    values: Array.from(doc.querySelectorAll(`[name=Meta${node.dataset.dwAttruuid}]`)).map((input) =>
                      input.value
                        .replace(/&/gi, '&amp;')
                        .replace(/"/gi, '&quot;')
                        .replace(/</gi, '&lt;')
                        .replace(/[\r\n]+/gi, '&#13;\n')
                        .replace(/>/gi, '&gt;')
                    ),
                  };

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

          debugger;

          return grouped;
        })
        .then((grouped) => {
          Promise.all([fetchLibraryInfo(), fetchFolderLinks()]).then((results) => {
            const [libraryInfo, folderNodes] = results;
            const foldersXml = renderers.folder(folderNodes);
            const libraryOpen = libraryInfo.shared ? libraryInfo.xml : '<library xmlns="http://www.demandware.com/xml/impex/library/2006-10-31">';
            const contentId = document.getElementsByClassName('table_detail')[0].childNodes[1].value;

            const rawXml = ['<?xml version="1.0" encoding="UTF-8"?>\n', libraryOpen, `    <content content-id="${contentId}">\n`, renderGroupedXml(grouped), '        <folder-links>\n', foldersXml + foldersXml ? '\n' : '', '        </folder-links>\n', '    </content>\n', '</library>'].join('');

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
})();
