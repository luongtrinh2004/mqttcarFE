// src/components/RouteSimulator.js

import React, { useMemo, useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fit map bounds only once per route load
function FitBoundsOnce({ bounds }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!done.current && bounds.length) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
      done.current = true;
    }
  }, [bounds, map]);
  return null;
}

/**
 * RouteSimulator
 *
 * Props:
 *  - route:    Array<{ lat:number, lng:number, title:string }>
 *  - position: [number, number] | null
 *  - statusArr:Array<0|1|2>
 */
export default function RouteSimulator({
  route = [],
  position = null,
  statusArr = [],
}) {
  // 1) Convert all waypoints to LatLng
  const pts = useMemo(() => route.map((p) => L.latLng(p.lat, p.lng)), [route]);

  // 2) Count how many waypoints are done (status=2)
  const doneCount = useMemo(
    () => statusArr.filter((s) => s === 2).length,
    [statusArr]
  );

  // 3) Tweened vehicle marker position
  const initialPos = position ? L.latLng(position[0], position[1]) : pts[0];
  const [animPos, setAnimPos] = useState(initialPos);
  const prev = useRef(initialPos);
  const raf = useRef();

  useEffect(() => {
    if (!position) return;
    const to = L.latLng(position[0], position[1]);
    const from = prev.current;
    const duration = 500; // ms
    let start = null;

    function step(timestamp) {
      if (!start) start = timestamp;
      const t = Math.min((timestamp - start) / duration, 1);
      const lat = from.lat + (to.lat - from.lat) * t;
      const lng = from.lng + (to.lng - from.lng) * t;
      setAnimPos(L.latLng(lat, lng));
      if (t < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        prev.current = to;
      }
    }

    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [position]);

  // 4) Wait until we have vehicle pos and at least one waypoint
  if (!animPos || pts.length === 0) {
    return <div style={{ width: "100%", height: "100%" }}>Loading map…</div>;
  }

  // 5) Build completed path: all waypoints [0..doneCount-1] plus animPos
  const completed = doneCount > 0 ? [...pts.slice(0, doneCount), animPos] : [];

  // 6) Build upcoming path: animPos then pts[doneCount..end]
  const upcoming = [animPos, ...pts.slice(doneCount)];

  // 7) Bounds: cover full upcoming so initial view shows all green
  const bounds = upcoming;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <MapContainer
        style={{ width: "100%", height: "100%" }}
        center={bounds[0]}
        zoom={13}
        scrollWheelZoom
      >
        <LayersControl position="topright">
          {/* Satellite imagery (Esri World Imagery) */}
          <LayersControl.BaseLayer checked name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles © Esri"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>

          {/* Standard street map (OSM) */}
          <LayersControl.BaseLayer name="Streets">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* Grey dashed polyline for completed segments */}
        {completed.length > 1 && (
          <Polyline
            positions={completed}
            pathOptions={{ color: "#aaa", weight: 4, dashArray: "4,6" }}
          />
        )}

        {/* Solid blue polyline for upcoming segments */}
        {upcoming.length > 1 && (
          <Polyline
            positions={upcoming}
            pathOptions={{ color: "#007bff", weight: 4 }}
          />
        )}

        {/* Highlight waypoints */}
        {pts.map((pt, i) => {
          const isDone = i < doneCount;
          const isNext = i === doneCount;
          const color = isDone ? "#aaa" : isNext ? "#28a745" : "#007bff";
          const radius = isNext ? 12 : 8;
          return (
            <CircleMarker
              key={i}
              center={pt}
              radius={radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Tooltip direction="top" offset={[0, -radius - 5]} permanent>
                {route[i].title}
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Animated vehicle marker */}
        <CircleMarker
          center={animPos}
          radius={8}
          pathOptions={{
            color: "#ff5722",
            fillColor: "#ff5722",
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="bottom" offset={[0, 8]} permanent>
            Xe
          </Tooltip>
        </CircleMarker>

        <FitBoundsOnce bounds={bounds} />
      </MapContainer>
    </div>
  );
}
