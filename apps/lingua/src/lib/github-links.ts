/** The GitHub page of repository `id` (`owner/repo`). */
export const repositoryUrl = (id: string) => `https://github.com/${id}`;

/** The GitHub profile of the account `login`. */
export const profileUrl = (login: string) => `https://github.com/${encodeURIComponent(login)}`;
