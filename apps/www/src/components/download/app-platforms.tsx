import { DeviceNav } from '#site/components/download/device-nav';
import { DesktopFamily } from '#site/components/download/families/desktop';
import { families } from '#site/components/download/families/meta';
import { MobileFamily } from '#site/components/download/families/mobile';
import { NasFamily } from '#site/components/download/families/nas';
import { TvFamily } from '#site/components/download/families/tv';

/** Every screen KROMA runs on, grouped by family, with a way straight to yours. */
export function AppPlatforms() {
  return (
    <div className="space-y-14">
      <DeviceNav families={families()} />
      <TvFamily />
      <DesktopFamily />
      <MobileFamily />
      <NasFamily />
    </div>
  );
}
