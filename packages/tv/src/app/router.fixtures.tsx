import type { TvScreens } from '#tv/app/router';

const stub = (name: string) => () => <div>{`screen:${name}`}</div>;

export function stubScreens(screens: Partial<TvScreens> = {}): TvScreens {
  return {
    connect: stub('connect'),
    profiles: stub('profiles'),
    addProfile: stub('addProfile'),
    addKids: stub('addKids'),
    quick: stub('quick'),
    unowned: stub('unowned'),
    deviceSettings: stub('deviceSettings'),
    pin: stub('pin'),
    profileMenu: stub('profileMenu'),
    home: stub('home'),
    grid: stub('grid'),
    genres: stub('genres'),
    genre: stub('genre'),
    search: stub('search'),
    person: stub('person'),
    movie: stub('movie'),
    show: stub('show'),
    discover: stub('discover'),
    player: stub('player'),
    trailer: stub('trailer'),
    report: stub('report'),
    releases: stub('releases'),
    ...screens,
  };
}
