import React, { useEffect, useRef } from 'react';

type MapBackgroundProps = {
  activeStopIndex: number;
  stops: { lat: number; lng: number; zoom: number }[];
  darkMode?: boolean;
};

declare global {
  interface Window {
    L: any;
  }
}

function loadLeaflet(): Promise<void> {
  return new Promise((resolve) => {
    if (window.L) { resolve(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve();
    document.body.appendChild(script);
  });
}

export default function MapBackground({ activeStopIndex, stops, darkMode = true }: MapBackgroundProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    loadLeaflet().then(() => {
      if (map.current || !mapContainer.current) return;
      const L = window.L;
      const start = stops[0];

      map.current = L.map(mapContainer.current, {
        center: [start.lat, start.lng],
        zoom: start.zoom,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        keyboard: false,
        boxZoom: false,
      });

      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
      }).addTo(map.current);

      map.current.getPane('tilePane')!.style.filter = darkMode
        ? 'brightness(0.45) contrast(1.2) saturate(1.3)'
        : 'brightness(0.85) contrast(1.05) saturate(1.1)';
    });
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const tilePane = map.current.getPane('tilePane');
    if (tilePane) {
      tilePane.style.filter = darkMode
        ? 'brightness(0.45) contrast(1.2) saturate(1.3)'
        : 'brightness(0.85) contrast(1.05) saturate(1.1)';
    }
  }, [darkMode]);

  useEffect(() => {
    if (!map.current) return;
    const stop = stops[activeStopIndex];
    if (stop) {
      map.current.flyTo([stop.lat, stop.lng], stop.zoom, {
        duration: 3.5,
        easeLinearity: 0.25,
      });
    }
  }, [activeStopIndex, stops]);

  return (
    <div className={darkMode ? 'satellite-map-bg' : 'satellite-map-bg light-mode'}>
      <div ref={mapContainer} className="satellite-map-container" />
      <div className="satellite-overlay-earth-glow" />
      <div className="satellite-overlay-vignette" />
      {!darkMode && <div className="satellite-light-overlay" />}
    </div>
  );
}
