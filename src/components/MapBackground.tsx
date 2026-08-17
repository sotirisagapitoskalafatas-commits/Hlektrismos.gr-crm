import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Ensure you set VITE_MAPBOX_TOKEN in your .env / Vercel Environment Variables
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiZHVtbXl0b2tlbiIsImEiOiJjbXl0b2tlbjEyMzQ1Njc4OTAifQ.dummy';

type MapBackgroundProps = {
  activeStopIndex: number;
  stops: { lat: number; lng: number; zoom: number; pitch: number; bearing: number }[];
};

export default function MapBackground({ activeStopIndex, stops }: MapBackgroundProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [stops[0].lng, stops[0].lat],
      zoom: stops[0].zoom,
      pitch: stops[0].pitch,
      bearing: stops[0].bearing,
      interactive: false, // Disable user interaction for scrollytelling
    });

    map.current.on('load', () => {
      // Add a slight atmospheric glow / fog
      map.current?.setFog({
        color: 'rgb(4, 11, 22)', // Dark blue/black space color
        'high-color': 'rgb(15, 45, 90)', // Blue atmospheric glow
        'horizon-blend': 0.1,
        'space-color': 'rgb(0, 0, 0)',
        'star-intensity': 0.8
      });
    });
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const stop = stops[activeStopIndex];
    if (stop) {
      map.current.flyTo({
        center: [stop.lng, stop.lat],
        zoom: stop.zoom,
        pitch: stop.pitch,
        bearing: stop.bearing,
        duration: 3000,
        essential: true,
      });
    }
  }, [activeStopIndex, stops]);

  return (
    <div 
      ref={mapContainer} 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        pointerEvents: 'none',
        filter: 'brightness(0.7) contrast(1.2)' // Dim it slightly so text is readable
      }} 
    />
  );
}
