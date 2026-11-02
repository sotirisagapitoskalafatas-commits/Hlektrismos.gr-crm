import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, LoaderCircle, MapPin, Search } from 'lucide-react';
import { createMap } from '@/lib/maps/map-provider';
import type { MapCoordinate, MapMarkerData, MapProvider } from '@/lib/maps/types';
import { geocodeAddress, reverseGeocode } from '@/lib/geo/geocoder';
import type { GeocodeResult } from '@/lib/geo/geocoder';
import { GEO_ERRORS, getCurrentLocation } from '@/lib/geo/location';

const ATHENS: MapCoordinate = { lat: 37.9838, lng: 23.7275 };
const LOCATION_MARKER: Omit<MapMarkerData, 'position'> = {
  id: 'selected-address', title: 'Τοποθεσία εγγραφής', subtitle: 'Επιλεγμένο σημείο', color: '#2563eb', size: 'lg',
};

type LocationValue = { address: string; lat: string; lng: string };

export default function AddressMapPicker({
  address, city = '', postalCode = '', lat, lng, onChange, label = 'Τοποθεσία στον χάρτη',
}: {
  address: string;
  city?: string;
  postalCode?: string;
  lat: string;
  lng: string;
  onChange: (value: LocationValue) => void;
  label?: string;
}) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapProvider | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef({ address, lat, lng });
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [query, setQuery] = useState([address, postalCode, city].filter(Boolean).join(', '));
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');

  onChangeRef.current = onChange;
  valueRef.current = { address, lat, lng };

  const selectedPoint = useMemo<MapCoordinate | null>(() => {
    const latitude = lat.trim() === '' ? NaN : Number(lat);
    const longitude = lng.trim() === '' ? NaN : Number(lng);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
      ? { lat: latitude, lng: longitude } : null;
  }, [lat, lng]);

  const showMarker = useCallback((point: MapCoordinate, subtitle?: string) => {
    const map = mapRef.current;
    if (!map?.isReady()) return;
    map.addMarkers([{ ...LOCATION_MARKER, position: point, subtitle: subtitle || 'Επιλεγμένο σημείο' }]);
    map.setViewport(point, 16);
  }, []);

  const applyLocation = useCallback((point: MapCoordinate, nextAddress: string) => {
    const value = valueRef.current;
    const addressValue = nextAddress.trim() || value.address;
    onChangeRef.current({ address: addressValue, lat: String(point.lat), lng: String(point.lng) });
    valueRef.current = { address: addressValue, lat: String(point.lat), lng: String(point.lng) };
    setQuery(addressValue);
    setResults([]);
    setMessage('Η τοποθεσία επιλέχθηκε. Πατήστε Αποθήκευση στη φόρμα για να καταχωρηθεί.');
    showMarker(point, addressValue || undefined);
  }, [showMarker]);

  const selectResult = useCallback((result: GeocodeResult) => {
    const labelText = [result.label, result.sublabel].filter(Boolean).join(', ');
    applyLocation(result.position, labelText);
  }, [applyLocation]);

  const chooseMapPoint = useCallback(async (point: MapCoordinate) => {
    setMessage('Αναζήτηση διεύθυνσης για το επιλεγμένο σημείο…');
    const found = await reverseGeocode(point.lat, point.lng);
    const value = found?.label || found?.address || valueRef.current.address;
    applyLocation(point, value);
    if (!found?.label && !found?.address) setMessage('Το σημείο επιλέχθηκε. Δεν βρέθηκε περιγραφή διεύθυνσης, μπορείτε να τη συμπληρώσετε στο πεδίο Διεύθυνση.');
  }, [applyLocation]);

  useEffect(() => {
    const element = mapEl.current;
    if (!element) return;
    let disposed = false;
    let provider: MapProvider | null = null;
    void (async () => {
      try {
        provider = await createMap();
        await provider.init(element, {
          center: selectedPoint ?? ATHENS,
          zoom: selectedPoint ? 15 : 11,
          onMapClick: point => { void chooseMapPoint(point); },
        });
        if (disposed) { provider.destroy(); return; }
        mapRef.current = provider;
        setReady(true);
        if (selectedPoint) {
          provider.addMarkers([{ ...LOCATION_MARKER, position: selectedPoint, subtitle: address || 'Επιλεγμένο σημείο' }]);
        }
      } catch {
        if (!disposed) setMapError('Ο διαδραστικός χάρτης δεν φορτώθηκε. Μπορείτε ακόμη να αναζητήσετε και να επιλέξετε διεύθυνση από τα αποτελέσματα.');
      }
    })();
    return () => {
      disposed = true;
      provider?.destroy();
      mapRef.current = null;
    };
    // The map is created once; later coordinate changes are applied by the marker effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (selectedPoint) {
      mapRef.current.addMarkers([{ ...LOCATION_MARKER, position: selectedPoint, subtitle: address || 'Επιλεγμένο σημείο' }]);
      mapRef.current.setViewport(selectedPoint, 15);
    } else {
      mapRef.current.clearMarkers();
    }
  }, [ready, selectedPoint?.lat, selectedPoint?.lng]);

  const search = async () => {
    const text = query.trim();
    if (text.length < 3 || searching) return;
    setSearching(true);
    setMessage('');
    const found = await geocodeAddress(text, selectedPoint ?? undefined);
    setSearching(false);
    setResults(found);
    if (found.length === 0) setMessage('Δεν βρέθηκαν αποτελέσματα. Δοκιμάστε οδό, αριθμό, περιοχή ή Τ.Κ.');
  };

  const locateMe = async () => {
    if (locating) return;
    setLocating(true);
    setMessage('');
    try {
      const point = await getCurrentLocation();
      const found = await reverseGeocode(point.lat, point.lng);
      applyLocation(point, found?.label || found?.address || valueRef.current.address);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'unavailable';
      setMessage(GEO_ERRORS[code as keyof typeof GEO_ERRORS] ?? 'Δεν ήταν δυνατός ο εντοπισμός της συσκευής.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <section className="sm:col-span-2 space-y-2" aria-label={label} data-address-map-picker>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-[13px] font-semibold text-ink" htmlFor="address-map-search">{label}</label>
        <button type="button" onClick={() => void locateMe()} disabled={locating}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-600 hover:underline disabled:opacity-50">
          {locating ? <LoaderCircle size={14} className="animate-spin" /> : <Crosshair size={14} />}
          Χρήση τρέχουσας τοποθεσίας
        </button>
      </div>
      <div className="flex gap-2">
        <input id="address-map-search" className="field min-w-0 flex-1" value={query}
          onChange={e => { setQuery(e.target.value); setResults([]); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }}
          placeholder="Αναζήτηση οδού, αριθμού, περιοχής ή ταχυδρομικού κώδικα…" />
        <button type="button" onClick={() => void search()} disabled={searching || query.trim().length < 3}
          className="atx-btn atx-btn-primary inline-flex shrink-0 items-center gap-1.5 disabled:opacity-50">
          {searching ? <LoaderCircle size={14} className="animate-spin" /> : <Search size={14} />}
          Αναζήτηση
        </button>
      </div>
      {results.length > 0 && (
        <div className="rounded-xl border border-[var(--atx-line)] bg-white shadow-sm divide-y divide-[var(--atx-line)]" role="listbox" aria-label="Αποτελέσματα διευθύνσεων">
          {results.map((result, index) => (
            <button key={`${result.label}-${result.position.lat}-${result.position.lng}-${index}`} type="button"
              role="option" aria-selected={false} onClick={() => selectResult(result)}
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-[var(--atx-blue-soft)]">
              <MapPin size={15} className="mt-0.5 shrink-0 text-[var(--atx-blue)]" />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">{result.label}</span>
                {result.sublabel && <span className="block text-[12px] text-[var(--atx-muted)]">{result.sublabel}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      <div ref={mapEl} className="h-[260px] w-full overflow-hidden rounded-xl border border-[var(--atx-line)] bg-slate-100" />
      <p className="text-[12px] text-[var(--atx-muted)]">Επιλέξτε μια διεύθυνση από την αναζήτηση ή πατήστε απευθείας στον χάρτη για να τοποθετήσετε την καρφίτσα.</p>
      {selectedPoint && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--atx-blue-soft)] px-3 py-2 text-[12px] text-[var(--atx-blue)]">
          <MapPin size={14} className="mt-0.5 shrink-0" />
          <span>Επιλεγμένο σημείο: {address || 'χωρίς περιγραφή διεύθυνσης'}</span>
        </div>
      )}
      {(message || mapError) && <p className="text-[12px] text-[var(--atx-muted)]" role="status">{mapError || message}</p>}
    </section>
  );
}
