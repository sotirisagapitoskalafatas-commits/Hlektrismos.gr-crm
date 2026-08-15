/** Web Mercator tile helpers for the satellite basemap used by the 3D Greece map. */

export const TILE_ZOOM = 7;

/** Bounding box around Greece [west, south, east, north]. */
export const GREECE_BBOX = { west: 19.0, south: 34.4, east: 28.6, north: 41.9 };

export function lonToTileX(lon: number, z: number) {
  return ((lon + 180) / 360) * 2 ** z;
}

export function latToTileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

export function tileXToLon(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}

export function tileYToLat(y: number, z: number) {
  const n = Math.PI - 2 * Math.PI * (y / 2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export type SatelliteTile = {
  key: string;
  url: string;
  /** Geographic bounds of the tile. */
  west: number;
  east: number;
  north: number;
  south: number;
};

/** Esri World Imagery — free satellite basemap, no API key required. */
function tileUrl(x: number, y: number, z: number) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

export function greeceSatelliteTiles(zoom = TILE_ZOOM): SatelliteTile[] {
  const x0 = Math.floor(lonToTileX(GREECE_BBOX.west, zoom));
  const x1 = Math.floor(lonToTileX(GREECE_BBOX.east, zoom));
  const y0 = Math.floor(latToTileY(GREECE_BBOX.north, zoom));
  const y1 = Math.floor(latToTileY(GREECE_BBOX.south, zoom));

  const tiles: SatelliteTile[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      tiles.push({
        key: `${zoom}/${x}/${y}`,
        url: tileUrl(x, y, zoom),
        west: tileXToLon(x, zoom),
        east: tileXToLon(x + 1, zoom),
        north: tileYToLat(y, zoom),
        south: tileYToLat(y + 1, zoom),
      });
    }
  }
  return tiles;
}
