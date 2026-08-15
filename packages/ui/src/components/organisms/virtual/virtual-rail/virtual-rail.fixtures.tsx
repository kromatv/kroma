export const TINT = ['#3A2E4F', '#1B1524'] as const;

export // Enough tiles that windowing is the point rather than a detail.
const TITLES = Array.from({ length: 400 }, (_, at) => ({ id: at, title: `Title ${at + 1}` }));
