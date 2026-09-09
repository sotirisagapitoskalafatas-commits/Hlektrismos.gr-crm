export type GeoErrorCode = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

export type UserLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: number;
};

export const GEO_ERRORS: Record<GeoErrorCode, string> = {
  unsupported: 'Η γεωτοποθέτηση δεν υποστηρίζεται από αυτή τη συσκευή.',
  denied: 'Αρνηθήκατε την πρόσβαση στη θέση. Ενεργοποιήστε την άδεια τοποθεσίας / GPS.',
  unavailable: 'Η θέση σας δεν είναι διαθέσιμη (LOCATION UNAVAILABLE).',
  timeout: 'Η θέση δεν ελήφθη εγκαίρως. Δοκιμάστε ξανά.',
};

function toErrorCode(err: GeolocationPositionError): GeoErrorCode {
  if (err.code === err.PERMISSION_DENIED) return 'denied';
  if (err.code === err.TIMEOUT) return 'timeout';
  return 'unavailable';
}

export function getCurrentLocation(opts?: { timeoutMs?: number }): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('unsupported')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy ?? 0),
        timestamp: pos.timestamp,
      }),
      err => reject(new Error(toErrorCode(err))),
      { enableHighAccuracy: true, timeout: opts?.timeoutMs ?? 8000, maximumAge: 15000 },
    );
  });
}

export function watchCurrentLocation(
  onLoc: (l: UserLocation) => void,
  onErr: (code: GeoErrorCode) => void,
): () => void {
  if (!('geolocation' in navigator)) { onErr('unsupported'); return () => {}; }
  const id = navigator.geolocation.watchPosition(
    pos => onLoc({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Math.round(pos.coords.accuracy ?? 0),
      timestamp: pos.timestamp,
    }),
    err => onErr(toErrorCode(err)),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}