export type ReleaseEnvironment =
  | 'production'
  | 'preview'
  | 'development'
  | 'ci'
  | 'build'
  | string;

export const releaseInfo = Object.freeze({
  version: __APP_VERSION__,
  commitSha: __BUILD_COMMIT__ || null,
  branch: __BUILD_REF__ || null,
  environment: __BUILD_ENVIRONMENT__ as ReleaseEnvironment,
  builtAt: __BUILD_TIME__,
});

export function releaseEnvironmentLabel(environment: string): string {
  switch (environment) {
    case 'production': return 'Παραγωγή';
    case 'preview': return 'Προεπισκόπηση';
    case 'development': return 'Ανάπτυξη';
    case 'ci': return 'CI / Έλεγχος';
    case 'build': return 'Τοπικό build';
    default: return 'Προσαρμοσμένο περιβάλλον';
  }
}

export function releaseEnvironmentTone(environment: string): 'green' | 'blue' | 'amber' | 'gray' {
  switch (environment) {
    case 'production': return 'green';
    case 'preview': return 'blue';
    case 'ci': return 'amber';
    default: return 'gray';
  }
}

export function formatBuildDate(value: string): string {
  if (!value) return 'Μη διαθέσιμο';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Μη διαθέσιμο';
  return new Intl.DateTimeFormat('el-GR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
