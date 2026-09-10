import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapCoordinate, MapMarkerData, MapProvider, MapProviderOpts } from './types';

const ROUTE_SRC = 'route';
const ROUTE_LAYER = 'route-line';

const GREEK_CENTER: MapCoordinate = { lat: 37.9838, lng: 23.7275 };

const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'];

// Mapbox style template URLs ({s}, {r}) are NOT substituted by MapLibre for
// raster sources — the literal host is requested and DNS fails. Emit concrete
// CARTO subdomain URLs and drop the retina flag so tiles actually load.
// VITE_MAP_STYLE_URL, when provided, overrides the generated CARTO raster style.
const MAP_STYLE_URL = (import.meta.env.VITE_MAP_STYLE_URL as string | undefined)?.trim() || undefined;

function buildStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: CARTO_SUBDOMAINS.map(s =>
          `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`),
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      },
    },
    layers: [
      { id: 'osm', type: 'raster', source: 'osm' },
    ],
  };
}

function markerElement(m: MapMarkerData): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.id = m.id;
  btn.className = 'map-marker' + (m.size === 'sm' ? ' sm' : m.size === 'lg' ? ' lg' : '');
  if (m.pulse) btn.classList.add('pulse');
  if (m.color) btn.style.setProperty('--c', m.color);
  btn.title = m.title + (m.subtitle ? ` — ${m.subtitle}` : '');
  const dot = document.createElement('span');
  dot.className = 'map-marker-dot';
  btn.appendChild(dot);
  return btn;
}

export function createMaplibreProvider(): MapProvider {
  let map: maplibregl.Map | null = null;
  let markers: maplibregl.Marker[] = [];
  let lineId: string | null = null;
  let ready = false;
  let onMarkerClick: ((id: string) => void) | undefined;

  function clearMarkers() {
    markers.forEach(m => m.remove());
    markers = [];
  }

  function clearRoute() {
    if (!map) return;
    if (lineId && map.getLayer(lineId)) map.removeLayer(lineId);
    if (map.getSource(ROUTE_SRC)) map.removeSource(ROUTE_SRC);
    lineId = null;
  }

  async function init(container: HTMLElement, opts?: MapProviderOpts) {
    map = new maplibregl.Map({
      container,
      style: MAP_STYLE_URL ?? buildStyle(),
      center: opts?.center ? [opts.center.lng, opts.center.lat] : [GREEK_CENTER.lng, GREEK_CENTER.lat],
      zoom: opts?.zoom ?? 11,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    onMarkerClick = opts?.onMarkerClick;
    const onLoad = () => {
      ready = true;
      map?.resize();
    };
    map.on('load', onLoad);
    if (map.loaded()) onLoad();
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      const el = e.originalEvent.target as HTMLElement | null;
      const hit = el?.closest?.('.map-marker') as HTMLElement | null;
      if (hit?.dataset.id) {
        onMarkerClick?.(hit.dataset.id);
        return;
      }
      opts?.onMapClick?.();
    });
    await new Promise<void>(resolve => {
      if (map?.loaded()) { resolve(); return; }
      map?.once('load', () => resolve());
    });
  }

  return {
    init,
    isReady() { return ready; },
    invalidateSize() { map?.resize(); },

    addMarkers(list: MapMarkerData[]) {
      clearMarkers();
      if (!map) return;
      list.forEach(m => {
        const el = markerElement(m);
        el.addEventListener('click', () => onMarkerClick?.(m.id));
        const mk = new maplibregl.Marker({ element: el })
          .setLngLat([m.position.lng, m.position.lat])
          .addTo(map!);
        markers.push(mk);
      });
    },

    clearMarkers,

    fitBounds(coords: MapCoordinate[], opts?: { padding?: number; maxZoom?: number }) {
      if (!map || coords.length === 0) return;
      const bounds = new maplibregl.LngLatBounds();
      coords.forEach(c => bounds.extend([c.lng, c.lat]));
      map.fitBounds(bounds, { padding: opts?.padding ?? 48, maxZoom: opts?.maxZoom ?? 14, duration: 500 });
    },

    setViewport(center: MapCoordinate, zoom?: number) {
      if (!map) return;
      map.easeTo({ center: [center.lng, center.lat], zoom: zoom ?? map.getZoom(), duration: 400 });
    },

    drawRoute(points: MapCoordinate[], color = '#1c6f52') {
      if (!map || points.length < 2) return;
      clearRoute();
      map.addSource(ROUTE_SRC, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: points.map(p => [p.lng, p.lat]),
          },
        },
      });
      map.addLayer({
        id: ROUTE_LAYER,
        type: 'line',
        source: ROUTE_SRC,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.8, 'line-dasharray': [2, 1] },
      });
      lineId = ROUTE_LAYER;
    },

    clearRoute,

    destroy() {
      clearMarkers();
      if (map) {
        if (lineId && map.getLayer(lineId)) map.removeLayer(lineId);
        map.remove();
      }
      map = null;
      lineId = null;
      ready = false;
    },
  };
}