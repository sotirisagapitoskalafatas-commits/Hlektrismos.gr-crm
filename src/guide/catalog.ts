/* The one place Vite is involved: the Markdown files of docs/atlas-guide are bundled as text and handed to the pure library builder. */
import { buildLibrary } from './library';

const files = import.meta.glob('../../docs/atlas-guide/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
export const LIBRARY = buildLibrary(files);
