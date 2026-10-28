/** The named data volume persists the library; the user customizes the host media path. */
export function dockerCommand(image: string): string {
  return [
    'docker run -d',
    '  --name kroma',
    '  --restart unless-stopped',
    '  -p 4040:4040',
    '  -e KROMA_MEDIA_DIRS=/media',
    '  -v kroma-data:/data',
    '  -v /path/to/media:/media',
    `  ${image}`,
  ].join(' \\\n');
}
