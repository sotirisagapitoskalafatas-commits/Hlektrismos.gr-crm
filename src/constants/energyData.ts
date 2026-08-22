export interface ServiceType {
  key: string;
  label: string;
  icon: string;
}

export const SERVICES_LIST: ServiceType[] = [
  { key: 'Ρεύμα', label: 'Ρεύμα', icon: '⚡' },
  { key: 'Φυσικό Αέριο', label: 'Φυσικό Αέριο', icon: '🔥' },
  { key: 'Φωτοβολταϊκά', label: 'Φωτοβολταϊκά', icon: '☀️' },
  { key: 'Ηλεκτροκίνηση', label: 'Ηλεκτροκίνηση', icon: '🚗' },
];

export interface ProviderProgram {
  provider: string;
  program: string;
  color: 'green' | 'blue' | 'yellow' | 'orange';
  serviceType: 'electricity' | 'solar' | 'gas' | 'ev';
  customerType: 'B2C' | 'B2B';
  officialUrl?: string;
}

export const PROVIDERS_AND_PROGRAMS: ProviderProgram[] = [
  // ΔΕΗ
  { provider: 'ΔΕΗ', program: 'Flex Home', color: 'green', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.dei.gr/gr/ekploseis/proionta/flex-home/' },
  { provider: 'ΔΕΗ', program: 'Classic Home', color: 'blue', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.dei.gr/gr/ekploseis/proionta/classic-home/' },
  { provider: 'ΔΕΗ', program: 'Variable Home', color: 'yellow', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.dei.gr/gr/ekploseis/proionta/variable-home/' },
  { provider: 'ΔΕΗ', program: 'Green Home', color: 'orange', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.dei.gr/gr/ekploseis/proionta/green-home/' },
  { provider: 'ΔΕΗ', program: 'Flex Business', color: 'green', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.dei.gr/gr/ekploseis/proionta/flex-business/' },
  { provider: 'ΔΕΗ', program: 'Classic Business', color: 'blue', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.dei.gr/gr/ekploseis/proionta/classic-business/' },
  { provider: 'ΔΕΗ', program: 'Variable Business', color: 'yellow', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.dei.gr/gr/ekploseis/proionta/variable-business/' },

  // Protergia
  { provider: 'Protergia', program: 'Flex Home', color: 'green', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.protergia.gr/el/products/flex-home/' },
  { provider: 'Protergia', program: 'Classic Home', color: 'blue', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.protergia.gr/el/products/classic-home/' },
  { provider: 'Protergia', program: 'Variable Home', color: 'yellow', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.protergia.gr/el/products/variable-home/' },
  { provider: 'Protergia', program: 'Green Home', color: 'orange', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.protergia.gr/el/products/green-home/' },
  { provider: 'Protergia', program: 'Flex Business', color: 'green', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.protergia.gr/el/products/flex-business/' },
  { provider: 'Protergia', program: 'Classic Business', color: 'blue', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.protergia.gr/el/products/classic-business/' },

  // ΗΡΩΝ
  { provider: 'ΗΡΩΝ', program: 'Flex Home', color: 'green', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.heron.gr/flex-home/' },
  { provider: 'ΗΡΩΝ', program: 'Classic Home', color: 'blue', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.heron.gr/classic-home/' },
  { provider: 'ΗΡΩΝ', program: 'Variable Home', color: 'yellow', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.heron.gr/variable-home/' },
  { provider: 'ΗΡΩΝ', program: 'Green Home', color: 'orange', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.heron.gr/green-home/' },
  { provider: 'ΗΡΩΝ', program: 'Flex Business', color: 'green', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.heron.gr/flex-business/' },
  { provider: 'ΗΡΩΝ', program: 'Classic Business', color: 'blue', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.heron.gr/classic-business/' },
  { provider: 'ΗΡΩΝ', program: 'Variable Business', color: 'yellow', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.heron.gr/variable-business/' },

  // nrg
  { provider: 'nrg', program: 'Flex Home', color: 'green', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.nrg.gr/flex-home/' },
  { provider: 'nrg', program: 'Classic Home', color: 'blue', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.nrg.gr/classic-home/' },
  { provider: 'nrg', program: 'Variable Home', color: 'yellow', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.nrg.gr/variable-home/' },
  { provider: 'nrg', program: 'Green Home', color: 'orange', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.nrg.gr/green-home/' },
  { provider: 'nrg', program: 'Flex Business', color: 'green', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.nrg.gr/flex-business/' },
  { provider: 'nrg', program: 'Classic Business', color: 'blue', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.nrg.gr/classic-business/' },

  // ZeniΘ
  { provider: 'ZeniΘ', program: 'Flex Home', color: 'green', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.zenith.gr/flex-home/' },
  { provider: 'ZeniΘ', program: 'Classic Home', color: 'blue', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.zenith.gr/classic-home/' },
  { provider: 'ZeniΘ', program: 'Variable Home', color: 'yellow', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.zenith.gr/variable-home/' },
  { provider: 'ZeniΘ', program: 'Green Home', color: 'orange', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.zenith.gr/green-home/' },
  { provider: 'ZeniΘ', program: 'Flex Business', color: 'green', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.zenith.gr/flex-business/' },
  { provider: 'ZeniΘ', program: 'Classic Business', color: 'blue', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.zenith.gr/classic-business/' },

  // Volton
  { provider: 'Volton', program: 'Flex Home', color: 'green', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.volton.gr/flex-home/' },
  { provider: 'Volton', program: 'Classic Home', color: 'blue', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.volton.gr/classic-home/' },
  { provider: 'Volton', program: 'Variable Home', color: 'yellow', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.volton.gr/variable-home/' },
  { provider: 'Volton', program: 'Green Home', color: 'orange', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.volton.gr/green-home/' },
  { provider: 'Volton', program: 'Flex Business', color: 'green', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.volton.gr/flex-business/' },
  { provider: 'Volton', program: 'Classic Business', color: 'blue', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.volton.gr/classic-business/' },

  // Φυσικό Αέριο
  { provider: 'Φυσικό Αέριο', program: 'Flex Home', color: 'green', serviceType: 'gas', customerType: 'B2C', officialUrl: 'https://www.fysikoaerio.gr/flex-home/' },
  { provider: 'Φυσικό Αέριο', program: 'Classic Home', color: 'blue', serviceType: 'gas', customerType: 'B2C', officialUrl: 'https://www.fysikoaerio.gr/classic-home/' },
  { provider: 'Φυσικό Αέριο', program: 'Variable Home', color: 'yellow', serviceType: 'gas', customerType: 'B2C', officialUrl: 'https://www.fysikoaerio.gr/variable-home/' },
  { provider: 'Φυσικό Αέριο', program: 'Flex Business', color: 'green', serviceType: 'gas', customerType: 'B2B', officialUrl: 'https://www.fysikoaerio.gr/flex-business/' },
  { provider: 'Φυσικό Αέριο', program: 'Classic Business', color: 'blue', serviceType: 'gas', customerType: 'B2B', officialUrl: 'https://www.fysikoaerio.gr/classic-business/' },

  // Ελίν
  { provider: 'Ελίν', program: 'Flex Home', color: 'green', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.elen.gr/flex-home/' },
  { provider: 'Ελίν', program: 'Classic Home', color: 'blue', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.elen.gr/classic-home/' },
  { provider: 'Ελίν', program: 'Variable Home', color: 'yellow', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.elen.gr/variable-home/' },
  { provider: 'Ελίν', program: 'Green Home', color: 'orange', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.elen.gr/green-home/' },
  { provider: 'Ελίν', program: 'Flex Business', color: 'green', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.elen.gr/flex-business/' },

  // Enerwave
  { provider: 'Enerwave', program: 'Flex Home', color: 'green', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.enerwave.gr/flex-home/' },
  { provider: 'Enerwave', program: 'Classic Home', color: 'blue', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.enerwave.gr/classic-home/' },
  { provider: 'Enerwave', program: 'Variable Home', color: 'yellow', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.enerwave.gr/variable-home/' },
  { provider: 'Enerwave', program: 'Flex Business', color: 'green', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.enerwave.gr/flex-business/' },

  // Eunice Power
  { provider: 'Eunice Power', program: 'Flex Home', color: 'green', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.eunicepower.gr/flex-home/' },
  { provider: 'Eunice Power', program: 'Classic Home', color: 'blue', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.eunicepower.gr/classic-home/' },
  { provider: 'Eunice Power', program: 'Variable Home', color: 'yellow', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.eunicepower.gr/variable-home/' },
  { provider: 'Eunice Power', program: 'Green Home', color: 'orange', serviceType: 'electricity', customerType: 'B2C', officialUrl: 'https://www.eunicepower.gr/green-home/' },
  { provider: 'Eunice Power', program: 'Flex Business', color: 'green', serviceType: 'electricity', customerType: 'B2B', officialUrl: 'https://www.eunicepower.gr/flex-business/' },
];

export const PROVIDER_LIST = [...new Set(PROVIDERS_AND_PROGRAMS.map(p => p.provider))];

export const getProgramsForProvider = (provider: string): ProviderProgram[] =>
  PROVIDERS_AND_PROGRAMS.filter(p => p.provider === provider);

export const getProvidersForService = (serviceType: string): string[] => {
  if (serviceType === 'Φωτοβολταϊκά') return ['ΔΕΗ', 'Protergia', 'ΗΡΩΝ', 'nrg', 'ZeniΘ', 'Volton', 'Ελίν', 'Enerwave', 'Eunice Power'];
  if (serviceType === 'Φυσικό Αέριο') return ['Φυσικό Αέριο'];
  if (serviceType === 'Ηλεκτροκίνηση') return ['ΔΕΗ', 'Protergia', 'nrg'];
  return [...new Set(PROVIDERS_AND_PROGRAMS.filter(p => p.serviceType === 'electricity').map(p => p.provider))];
};

export const LEAD_SOURCES = [
  { key: 'website', label: 'Ιστοσελίδα' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'agent_direct', label: 'Από Πωλητή' },
  { key: 'referral', label: 'Σύσταση' },
  { key: 'google_maps_scrape', label: 'B2B Scraper' },
  { key: 'phone_call', label: 'Τηλεφωνική' },
  { key: 'email', label: 'Email' },
  { key: 'other', label: 'Άλλο' },
];

export const PROVIDER_COLORS: Record<string, string> = {
  'ΔΕΗ': '#1a5276',
  'Protergia': '#c0392b',
  'ΗΡΩΝ': '#2ecc71',
  'nrg': '#3498db',
  'ZeniΘ': '#8e44ad',
  'Volton': '#f39c12',
  'Φυσικό Αέριο': '#e67e22',
  'Ελίν': '#1abc9c',
  'Enerwave': '#2c3e50',
  'Eunice Power': '#e74c3c',
};

export const TARIFF_COLOR_MAP: Record<string, { bg: string; text: string; label: string }> = {
  green: { bg: '#dcfce7', text: '#166534', label: 'Πράσινο' },
  blue: { bg: '#dbeafe', text: '#1e40af', label: 'Μπλε' },
  yellow: { bg: '#fef9c3', text: '#854d0e', label: 'Κίτρινο' },
  orange: { bg: '#ffedd5', text: '#9a3412', label: 'Πορτοκαλί' },
};
