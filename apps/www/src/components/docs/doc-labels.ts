import type { DocSectionId, DocSlug } from '#site/lib/docs';
import { m } from '#site/paraglide/messages';

/** The short name of each guide in the sidebar and the pager. */
export const DOC_NAV_LABEL: Record<DocSlug, () => string> = {
  index: m.docs_nav_index,
  docker: m.docs_nav_docker,
  synology: m.docs_nav_synology,
  'other-nas': m.docs_nav_other_nas,
  'media-folders': m.docs_nav_media_folders,
  'first-run': m.docs_nav_first_run,
  tv: m.docs_nav_tv,
  'samsung-tv': m.docs_nav_samsung_tv,
  'lg-tv': m.docs_nav_lg_tv,
  'android-tv': m.docs_nav_android_tv,
  'apple-tv': m.docs_nav_apple_tv,
  mobile: m.docs_nav_mobile,
  desktop: m.docs_nav_desktop,
  'hardware-transcoding': m.docs_nav_hardware_transcoding,
  network: m.docs_nav_network,
  updates: m.docs_nav_updates,
  configuration: m.docs_nav_configuration,
  troubleshooting: m.docs_nav_troubleshooting,
};

/** The heading of each section of the sidebar. */
export const DOC_SECTION_LABEL: Record<DocSectionId, () => string> = {
  start: m.docs_section_start,
  server: m.docs_section_server,
  apps: m.docs_section_apps,
  operate: m.docs_section_operate,
};
