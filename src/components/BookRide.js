import React, { useState, useEffect } from "react";
import mqtt from "mqtt";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  CircleMarker,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

// Kết nối MQTT WebSocket
const client = mqtt.connect("ws://116.118.95.187:8083/mqtt", {
  username: "ducchien0612",
  password: "123456",
});

client.on("error", (err) => console.error("❌ MQTT error:", err.message));
client.on("connect", () => console.log("✅ MQTT connected from BookRide"));

// Tự động zoom đến vị trí truyền vào
function ZoomTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, 17);
  }, [position, map]);
  return null;
}

// Xử lý click bản đồ để thêm điểm đón
function MapClickHandler({ points, setPoints }) {
  useMapEvents({
    click(e) {
      if (points.length >= 5) {
        alert("⚠️ Tối đa 5 điểm!");
        return;
      }
      const newPoint = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        title: `Điểm ${points.length + 1}`,
        id: Date.now() + "-" + Math.random(),
      };
      setPoints([...points, newPoint]);
    },
  });
  return null;
}

export default function BookRide({ drivers }) {
  const [carId, setCarId] = useState("");
  const [points, setPoints] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searchResult, setSearchResult] = useState(null);
  const [mapCenter, setMapCenter] = useState([21.028511, 105.804817]); // Hà Nội

  // Gợi ý tìm kiếm địa điểm (autocomplete)
  useEffect(() => {
    if (!searchText) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        searchText
      )}&countrycodes=vn&limit=5`,
      { signal: controller.signal }
    )
      .then((res) => res.json())
      .then((data) => setSuggestions(data))
      .catch(() => {});
    return () => controller.abort();
  }, [searchText]);

  // Khi chọn xe → zoom đến vị trí xe
  useEffect(() => {
    if (carId && drivers[carId]?.position) {
      const { lat, lng } = drivers[carId].position;
      setMapCenter([lat, lng]);
    }
  }, [carId, drivers]);

  // Gửi route khi nhấn "Đặt cuốc xe"
  const handleSubmit = () => {
    if (!carId || points.length < 2) {
      alert("❌ Cần chọn xe và ít nhất 2 điểm!");
      return;
    }

    const route = points.map((pt, i) => ({
      id: `${Date.now()}-${i}`,
      title: pt.title || `Điểm ${i + 1}`,
      lat: pt.lat,
      lng: pt.lng,
    }));

    const payload = {
      route,
      statusArr: Array(route.length).fill(0),
    };

    client.publish(
      `car/${carId}/route`,
      JSON.stringify(payload),
      { qos: 0 },
      (err) => {
        if (err) alert("❌ Gửi thất bại");
        else {
          alert(`✅ Đã gửi cuốc xe cho ${carId}`);
          setPoints([]);
          setCarId("");
          setSearchText("");
          setSearchResult(null);
          setSuggestions([]);
          setShowForm(false);
        }
      }
    );
  };

  return (
    <div
      style={{
        padding: 16,
        background: "#fff",
        borderRadius: 8,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <button
        style={{
          background: "#3498db",
          color: "#fff",
          padding: "10px 16px",
          borderRadius: 6,
          border: "none",
          cursor: "pointer",
          marginBottom: 12,
        }}
        onClick={() => setShowForm(!showForm)}
      >
        {showForm ? "Đóng" : "Đặt xe"}
      </button>

      {showForm && (
        <>
          {/* Chọn xe */}
          <div style={{ marginBottom: 10 }}>
            Xe:
            <select
              value={carId}
              onChange={(e) => setCarId(e.target.value)}
              style={{ marginLeft: 10, padding: 6 }}
            >
              <option value="">--Chọn xe--</option>
              {Object.keys(drivers).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          {/* Ô tìm kiếm */}
          <div>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Tìm địa điểm..."
              style={{
                width: "100%",
                padding: 8,
                border: "1px solid #ccc",
                borderRadius: 6,
              }}
            />
            {suggestions.length > 0 && (
              <ul
                style={{
                  background: "#fff",
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  maxHeight: 150,
                  overflowY: "auto",
                }}
              >
                {suggestions.map((sug, idx) => (
                  <li
                    key={idx}
                    onClick={() => {
                      const point = {
                        lat: parseFloat(sug.lat),
                        lng: parseFloat(sug.lon),
                        title: sug.display_name,
                      };
                      setSearchResult(point);
                      setMapCenter([point.lat, point.lng]);
                      setSearchText(point.title);
                      setSuggestions([]);
                    }}
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid #eee",
                      cursor: "pointer",
                    }}
                  >
                    {sug.display_name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Danh sách điểm */}
          <div style={{ margin: "10px 0" }}>
            <strong>📍 Điểm đón:</strong>
            <ul style={{ paddingLeft: 20 }}>
              {points.map((pt, idx) => (
                <li key={pt.id}>
                  {idx + 1}. {pt.title}
                  <button
                    onClick={() =>
                      setPoints(points.filter((p) => p.id !== pt.id))
                    }
                    style={{
                      marginLeft: 10,
                      background: "none",
                      border: "none",
                      color: "#c00",
                      cursor: "pointer",
                    }}
                  >
                    ❌
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Bản đồ */}
          <div
            style={{
              height: 300,
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 10,
            }}
          >
            <MapContainer
              center={mapCenter}
              zoom={15}
              style={{ height: "100%" }}
              scrollWheelZoom
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap"
              />
              <ZoomTo position={mapCenter} />
              <MapClickHandler points={points} setPoints={setPoints} />

              {searchResult && (
                <Marker
                  position={[searchResult.lat, searchResult.lng]}
                  icon={L.divIcon({
                    html: `<div style="background:#27ae60;color:#fff;padding:4px 6px;border-radius:4px;">+</div>`,
                  })}
                />
              )}

              {points.map((pt, i) => (
                <Marker
                  key={pt.id}
                  position={[pt.lat, pt.lng]}
                  icon={L.divIcon({
                    html: `<div style="background:#2c3e50;color:#fff;padding:4px 6px;border-radius:4px;">${
                      i + 1
                    }</div>`,
                  })}
                />
              ))}

              {carId && drivers[carId]?.position && (
                <CircleMarker
                  center={[
                    drivers[carId].position.lat,
                    drivers[carId].position.lng,
                  ]}
                  radius={10}
                  pathOptions={{
                    color: "#3498db",
                    fillColor: "#3498db",
                    fillOpacity: 1,
                    weight: 2,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -12]} permanent>
                    🚗 Xe {carId}
                  </Tooltip>
                </CircleMarker>
              )}
            </MapContainer>
          </div>

          {/* Thêm điểm tìm kiếm */}
          {searchResult && (
            <button
              style={{
                marginBottom: 10,
                padding: "6px 12px",
                background: "#27ae60",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
              onClick={() => {
                if (points.length >= 5) {
                  alert("⚠️ Tối đa 5 điểm!");
                  return;
                }
                setPoints([
                  ...points,
                  { ...searchResult, id: Date.now() + "-" + Math.random() },
                ]);
                setSearchResult(null);
              }}
            >
              ➕ Thêm điểm này
            </button>
          )}

          {/* Gửi route */}
          <button
            onClick={handleSubmit}
            style={{
              padding: "10px 16px",
              background: "#2ecc71",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: "bold",
            }}
            disabled={!carId || points.length < 2}
          >
            🚕 Đặt cuốc xe
          </button>
        </>
      )}
    </div>
  );
}
