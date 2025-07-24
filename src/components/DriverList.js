// src/components/DriverList.js

import React, { useEffect, useState, useRef } from "react";
import mqtt from "mqtt";
import "leaflet/dist/leaflet.css";
import RouteSimulator from "./RouteSimulator";
import BookRide from "./BookRide";

const ALERT_SOUND = "/notificatio.mp3";

export default function DriverList() {
  const [drivers, setDrivers] = useState({});
  const [logs, setLogs] = useState([]); // { key, text, isRoute }
  const [notif, setNotif] = useState(null);

  const clientRef = useRef(null);
  const prevStatusRef = useRef({});
  const logCounter = useRef(0);
  const audioRef = useRef(null);

  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);

  //  const handleMapClick = (e) => {
  //  const { lat, lng } = e.latlng;
  //if (!pickup) setPickup({ lat, lng, title: "Điểm đón" });
  //else if (!dropoff) setDropoff({ lat, lng, title: "Điểm đến" });
  //};

  // Add a new log entry
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    const full = `${time} | ${msg}`;
    const isRoute = msg.includes("✉️ ROUTE");
    setLogs((prev) => [
      { key: logCounter.current++, text: full, isRoute },
      ...prev,
    ]);
  };

  // Chỉ hiển thị banner (không play sound)
  const showBanner = (msg) => {
    setNotif(msg);
    setTimeout(() => setNotif(null), 10000);
  };

  // Hiển thị banner + play sound
  const showSoundBanner = (msg) => {
    setNotif(msg);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
    setTimeout(() => setNotif(null), 10000);
  };

  useEffect(() => {
    const client = mqtt.connect("ws://116.118.95.187:8083/mqtt", {
      username: "ducchien0612",
      password: "123456",
    });
    clientRef.current = client;

    client.on("connect", () => {
      addLog("🔌 Connected");
      client.subscribe("car/+/route", () => addLog("📡 sub route"));
      client.subscribe("car/+/telemetry", () => addLog("📡 sub telemetry"));
    });
    client.on("error", (e) => addLog(`❌ ${e.message}`));
    client.on("close", () => addLog("🔒 Disconnected"));

    client.on("message", (topic, msg) => {
      // --- ROUTE handler ---
      const rm = topic.match(/^car\/(.+)\/route$/);
      if (rm) {
        const id = rm[1];
        addLog(`✉️ ROUTE for ${id}`);

        let payload;
        try {
          payload = JSON.parse(msg.toString());
        } catch {
          return addLog(`❌ bad JSON route ${id}`);
        }

        if (Array.isArray(payload.route)) {
          const init = Array.isArray(payload.statusArr)
            ? payload.statusArr
            : payload.route.map(() => 0);

          setDrivers((prev) => ({
            ...prev,
            [id]: {
              id,
              route: payload.route,
              statusArr: init,
              position: payload.position || prev[id]?.position || null,
            },
          }));
          prevStatusRef.current[id] = init;

          // nếu init toàn 0 thì coi như booking mới → play sound
          const allZero = init.every((s) => s === 0);
          if (allZero) {
            showSoundBanner(`Xe ${id} nhận lịch trình mới`);
          } else {
            showBanner(`Xe ${id} nhận lịch trình`);
          }
        }
        return;
      }

      // --- TELEMETRY handler ---
      const tm = topic.match(/^car\/(.+)\/telemetry$/);
      if (!tm) return;
      const id = tm[1];

      let data;
      try {
        data = JSON.parse(msg.toString());
      } catch {
        return addLog(`❌ bad JSON tel ${id}`);
      }
      const pos = data.position;
      const statusArr = data.statusArr || [];
      const route = data.route || [];

      addLog(
        `📊 ${id} → pos(${pos.lat.toFixed(6)},${pos.lng.toFixed(
          6
        )}) [${statusArr.join(" ")}]`
      );

      // trạng thái chuyển đổi (chỉ banner, không sound)
      const prevArr = prevStatusRef.current[id] || [];
      statusArr.forEach((st, i) => {
        const pv = prevArr[i] ?? 0;
        if (pv !== st) {
          const t = route[i]?.title || `#${i + 1}`;
          if (pv === 0 && st === 1) {
            addLog(`🚗 ${id} ĐANG ĐẾN “${t}”`);
            showBanner(`Xe ${id} đang đến điểm “${t}”`);
          }
          if (pv === 1 && st === 2) {
            addLog(`🛬 ${id} ĐÃ ĐẾN “${t}”`);
            showBanner(`Xe ${id} đã đến điểm “${t}”`);
          }
        }
      });

      // auto-clear route when all points are completed
      if (statusArr.length && statusArr.every((s) => s === 2)) {
        addLog(`✅ ${id} completed, auto‐clear`);
        showBanner(`Xe ${id} hoàn thành chuyến`);

        clientRef.current.publish(
          `car/${id}/route`,
          JSON.stringify({ route: [], statusArr: [] }),
          () => addLog(`✉️ cleared ${id} route`)
        );

        prevStatusRef.current[id] = [];

        setDrivers((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            route: [],
            statusArr: [],
            position: pos,
          },
        }));
        return;
      } else {
        prevStatusRef.current[id] = statusArr;
      }

      // normal update
      setDrivers((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] || {}),
          id,
          route: prev[id]?.route || [],
          statusArr,
          position: pos,
        },
      }));
    });

    return () => {
      client.end();
      addLog("🔒 cleanup");
    };
  }, []);

  // publish helper
  const publishRoute = (id, next) => {
    const drv = drivers[id];
    if (!drv) return;
    clientRef.current.publish(
      `car/${id}/route`,
      JSON.stringify({ route: drv.route, statusArr: next }),
      () => addLog(`✉️ ${id}: [${next.join(" ")}]`)
    );
  };

  // Styles + keyframes
  const s = {
    wrapper: {
      display: "flex",
      height: "100vh",
      fontFamily: "Segoe UI, sans-serif",
    },
    tableWrap: { flex: 1, padding: 20, background: "#f5f7fa" },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      background: "#fff",
      borderRadius: 8,
      overflow: "hidden",
      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
    },
    th: {
      padding: "12px 16px",
      background: "#283e4a",
      color: "#fff",
      textAlign: "left",
    },
    td: { padding: "12px 16px", borderBottom: "1px solid #ececec" },
    rowHover: { transition: "background 0.2s" },
    button: {
      padding: "6px 14px",
      border: "none",
      borderRadius: 4,
      cursor: "pointer",
      transition: "background 0.2s",
      fontSize: 14,
    },
    goBtn: { background: "#2ecc71", color: "#fff" },
    arrBtn: { background: "#3498db", color: "#fff" },
    routeDetails: { marginTop: 30 },
    routeTable: { width: "100%", borderCollapse: "collapse", marginTop: 8 },
    rTh: {
      padding: "8px 12px",
      background: "#34495e",
      color: "#fff",
      textAlign: "left",
    },
    rTd: { padding: "8px 12px", borderBottom: "1px solid #ddd" },
    logs: {
      width: "30%",
      background: "#1e1f26",
      color: "#a8ff60",
      display: "flex",
      flexDirection: "column",
    },
    logHeader: {
      padding: "12px",
      background: "#14151a",
      color: "#fff",
      margin: 0,
    },
    logBody: {
      padding: "8px",
      overflowY: "auto",
      flex: 1,
      fontSize: 13,
      lineHeight: 1.4,
    },
    notif: {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      padding: "16px 0",
      background: "#ffd700",
      color: "#333",
      fontSize: "18px",
      fontWeight: "bold",
      textAlign: "center",
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      animation: "fadeNotif 10s forwards",
      zIndex: 9999,
    },
  };

  return (
    <div style={s.wrapper}>
      {/* audio for notification */}
      <audio ref={audioRef} src={ALERT_SOUND} preload="auto" />

      {/* fade keyframes */}
      <style>{`
        @keyframes fadeNotif {
          0%   { opacity: 1; }
          90%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .route-log {
          background: rgba(255,200,200,0.5);
          font-weight: bold;
        }
      `}</style>

      <div style={s.tableWrap}>
        {notif && <div style={s.notif}>{notif}</div>}

        <h2>Driver Dashboard</h2>
        <BookRide
          drivers={drivers}
          pickup={pickup}
          dropoff={dropoff}
          setPickup={setPickup}
          setDropoff={setDropoff}
        />

        <table style={s.table}>
          <thead>
            <tr>
              {["ID", "Lat", "Lng", "StatusArr", "Action"].map((h) => (
                <th key={h} style={s.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.values(drivers).map((d, i) => {
              const { statusArr = [], position, id } = d;
              const onTheWay = statusArr.includes(1);
              const pending = statusArr.some((s) => s === 0);
              const bg = i % 2 ? "#fdfdfd" : "#fff";
              let btn = null;
              if (statusArr.length > 0) {
                if (!onTheWay && pending) {
                  btn = (
                    <button
                      style={{ ...s.button, ...s.goBtn }}
                      onClick={() => {
                        const idx = statusArr.findIndex((s) => s === 0);
                        const next = [...statusArr];
                        next[idx] = 1;
                        publishRoute(id, next);
                      }}
                    >
                      Go
                    </button>
                  );
                } else if (onTheWay) {
                  btn = (
                    <button
                      style={{ ...s.button, ...s.arrBtn }}
                      onClick={() => {
                        const idx = statusArr.findIndex((s) => s === 1);
                        const next = [...statusArr];
                        next[idx] = 2;
                        publishRoute(id, next);
                      }}
                    >
                      Arrived
                    </button>
                  );
                }
              }

              return (
                <tr
                  key={id}
                  style={s.rowHover}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#eef3f7")
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.background = bg)}
                >
                  <td style={s.td}>{id}</td>
                  <td style={s.td}>{position?.lat.toFixed(6) ?? "–"}</td>
                  <td style={s.td}>{position?.lng.toFixed(6) ?? "–"}</td>
                  <td style={s.td}>{statusArr.join(" ")}</td>
                  <td style={s.td}>{btn}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Route Details */}
        <div
          style={{
            ...s.routeDetails,
            display: "grid",
            gridTemplateColumns: "1fr",
            rowGap: 20,
            marginTop: 30,
          }}
        >
          <h3 style={{ marginBottom: 10 }}>Route Details</h3>

          {Object.values(drivers).map((d) => {
            // ẩn khi chưa có route hoặc đã hoàn thành
            if (
              !d.route ||
              d.route.length === 0 ||
              (d.statusArr.length > 0 && d.statusArr.every((s) => s === 2))
            ) {
              return null;
            }

            return (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  columnGap: 20,
                  background: "#fff",
                  borderRadius: 8,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  overflow: "hidden",
                  minHeight: 300,
                }}
              >
                {/* Left: lịch trình */}
                <div
                  style={{
                    flex: 1,
                    padding: "16px 12px",
                    borderRight: "1px solid #ececec",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <strong style={{ marginBottom: 12 }}>Xe {d.id}</strong>
                  <table style={{ ...s.routeTable, flex: 1 }}>
                    <thead>
                      <tr>
                        <th style={s.rTh}>Title</th>
                        <th style={s.rTh}>Lat</th>
                        <th style={s.rTh}>Lng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.route.map((pt) => (
                        <tr key={pt.id}>
                          <td style={s.rTd}>{pt.title}</td>
                          <td style={s.rTd}>{pt.lat.toFixed(6)}</td>
                          <td style={s.rTd}>{pt.lng.toFixed(6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Right: bản đồ */}
                <div style={{ flex: 1, position: "relative" }}>
                  <RouteSimulator
                    route={d.route}
                    position={
                      d.position ? [d.position.lat, d.position.lng] : null
                    }
                    statusArr={d.statusArr}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/*
<div style={s.logs}>
  <h3 style={s.logHeader}>Console Logs</h3>
  <div style={s.logBody}>
    {logs.map(({ key, text, isRoute }) => (
      <div key={key} className={isRoute ? "route-log" : ""}>
        {text}
      </div>
    ))}
  </div>
</div>
*/}
    </div>
  );
}
