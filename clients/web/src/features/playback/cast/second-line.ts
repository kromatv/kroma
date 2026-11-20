interface Titled {
  showTitle?: string | null;
  season?: number | null;
  episode?: number | null;
  year?: number | null;
}

export function secondLine(item: Titled): string {
  if (item.showTitle) {
    const number = item.season && item.episode ? ` · S${item.season}E${item.episode}` : '';
    return `${item.showTitle}${number}`;
  }
  return item.year ? String(item.year) : '';
}
