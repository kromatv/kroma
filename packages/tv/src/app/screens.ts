import type { TvScreens } from '#tv/app/router';
import { TvAddKids } from '#tv/features/accounts/tv-add-kids.component';
import { TvAddProfile } from '#tv/features/accounts/tv-add-profile.component';
import { TvConnect } from '#tv/features/accounts/tv-connect.component';
import { TvDeviceSettings } from '#tv/features/accounts/tv-device-settings.component';
import { TvPin } from '#tv/features/accounts/tv-pin.component';
import { TvProfileMenu } from '#tv/features/accounts/tv-profile-menu.component';
import { TvProfiles } from '#tv/features/accounts/tv-profiles.component';
import { TvQuickConnect } from '#tv/features/accounts/tv-quick-connect.component';
import { TvServerUnowned } from '#tv/features/accounts/tv-server-unowned.component';
import { TvDiscoverDetail } from '#tv/features/catalog/discover/tv-discover-detail.component';
import { TvGenreGrid } from '#tv/features/catalog/tv-genre-grid.component';
import { TvGenres } from '#tv/features/catalog/tv-genres.component';
import { TvGrid } from '#tv/features/catalog/tv-grid.component';
import { TvHome } from '#tv/features/catalog/tv-home.component';
import { TvMovieDetail } from '#tv/features/catalog/tv-movie-detail.component';
import { TvPerson } from '#tv/features/catalog/tv-person.component';
import { TvSearch } from '#tv/features/catalog/tv-search.component';
import { TvShowDetail } from '#tv/features/catalog/tv-show-detail.component';
import { TvReleases } from '#tv/features/releases/tv-releases.component';
import { TvReport } from '#tv/features/reports/tv-report.component';

export const SCREENS: Omit<TvScreens, 'player' | 'trailer'> = {
  connect: TvConnect,
  profiles: TvProfiles,
  addProfile: TvAddProfile,
  addKids: TvAddKids,
  quick: TvQuickConnect,
  unowned: TvServerUnowned,
  deviceSettings: TvDeviceSettings,
  pin: TvPin,
  profileMenu: TvProfileMenu,
  home: TvHome,
  grid: TvGrid,
  genres: TvGenres,
  genre: TvGenreGrid,
  search: TvSearch,
  person: TvPerson,
  movie: TvMovieDetail,
  show: TvShowDetail,
  discover: TvDiscoverDetail,
  report: TvReport,
  releases: TvReleases,
};
