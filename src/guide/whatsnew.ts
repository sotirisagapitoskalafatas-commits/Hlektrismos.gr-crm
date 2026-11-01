/* What's New: a small hand-kept list. Only changes that exist in the application; planned work is labelled as planned and is never announced as done. */
export interface NewsItem { id: string; date: string; title: string; text: string; guide?: string; status: 'available' | 'planned'; roles: ('admin' | 'sales_agent')[] }
export const NEWS: NewsItem[] = [
  { id: 'learning-centre', date: '2026-11-01', title: 'Νέος Οδηγός ATLAS', text: 'Οδηγοί, ξενάγηση, χάρτες διαδικασιών, βοήθεια για προβλήματα και δοκιμαστική λειτουργία με φανταστικά στοιχεία.', guide: 'ti-einai-to-atlas', status: 'available', roles: ['admin', 'sales_agent'] },
  { id: 'password-change', date: '2026-11-01', title: 'Αλλαγή κωδικού από τον λογαριασμό', text: 'Στη σελίδα «Λογαριασμός» υπάρχει πλέον η κάρτα «Αλλαγή κωδικού πρόσβασης». Στον κοινό λογαριασμό Admin αποσυνδέει τις άλλες συσκευές του γραφείου.', guide: 'allagi-kodikou', status: 'available', roles: ['admin', 'sales_agent'] },
];
export const newsFor = (role: 'admin' | 'sales_agent', dismissed: string[]): NewsItem[] => NEWS.filter((n) => n.roles.includes(role) && !dismissed.includes(n.id));
