import {
  Actions,
  Credits as CreditsSlot,
  Media,
  Panel,
  PostPlay as PostPlaySlot,
  Report,
  Resume as ResumeSlot,
  SkipIntro as SkipIntroSlot,
  Subtitle,
  Subtitles,
  Title,
  Transport as TransportSlot,
  UpNext as UpNextSlot,
  Warning,
} from './player-parts';
import { Root } from './player-root';

const Player = {
  Root,
  Media,
  Actions,
  Panel,
  Title,
  Subtitle,
  Warning,
  Transport: TransportSlot,
  UpNext: UpNextSlot,
  Credits: CreditsSlot,
  PostPlay: PostPlaySlot,
  SkipIntro: SkipIntroSlot,
  Resume: ResumeSlot,
  Subtitles,
  Report,
};

export { Player };
