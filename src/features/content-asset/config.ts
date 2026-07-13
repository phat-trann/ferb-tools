namespace FerbToolsContentAssetConfig {
  export const BM_URLS = {
    libraries: '/on/demandware.store/Sites-Site/default/ViewContentSharedLibrary-List?SelectedMenuItem=content&CurrentMenuItemId=content',
  } as const;

  export const SITE_ID_BY_NAME: Record<string, string> = {
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

  export const ALLOWED_LOCALES = ['default', 'zh_HK', 'zh_TW', 'en_AU', 'en_HK', 'en_ID', 'en_MY', 'en_SG', 'en_TH', 'in_ID', 'ja_JP', 'ko_KR', 'th_TH'] as const;

  export function createDefaultSettings(): ContentAssetSettings {
    return {
      allowedLocales: [...ALLOWED_LOCALES],
      siteIdByName: { ...SITE_ID_BY_NAME },
    };
  }
}
