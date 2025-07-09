import React, { useEffect, useState, useRef } from "react";
import mqtt from "mqtt";

export default function DriverList() {
  const [drivers, setDrivers] = useState({});
  const [logs, setLogs] = useState([]); // { key, text, isRoute }
  const [notif, setNotif] = useState(null);
  const clientRef = useRef(null);
  const prevStatusRef = useRef({});
  const logCounter = useRef(0);

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

  // Show top notification banner
  const showNotif = (msg) => {
    setNotif(msg);
    setTimeout(() => setNotif(null), 10000); // 10s rồi fade
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
          showNotif(`Xe ${id} nhận lịch trình mới`);
        }
        return;
      }

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

      // trạng thái chuyển đổi
      const prevArr = prevStatusRef.current[id] || [];
      statusArr.forEach((st, i) => {
        const pv = prevArr[i] ?? 0;
        if (pv !== st) {
          const t = route[i]?.title || `#${i + 1}`;
          if (pv === 0 && st === 1) {
            addLog(`🚗 ${id} ĐANG ĐẾN “${t}”`);
            showNotif(`Xe ${id} đang đến điểm “${t}”`);
          }
          if (pv === 1 && st === 2) {
            addLog(`🛬 ${id} ĐÃ ĐẾN “${t}”`);
            showNotif(`Xe ${id} đã đến điểm “${t}”`);
          }
        }
      });

      // auto-reset chỉ clear statusArr để ẩn cột & details
      if (statusArr.length && statusArr.every((s) => s === 2)) {
        addLog(`✅ ${id} completed, auto‐reset`);
        showNotif(`Xe ${id} hoàn thành chuyến`);
        const zeros = statusArr.map(() => 0);
        clientRef.current.publish(
          `car/${id}/route`,
          JSON.stringify({ route, statusArr: zeros }),
          () => addLog(`✉️ reset ${id}: [${zeros.join(" ")}]`)
        );
        prevStatusRef.current[id] = zeros;
        setDrivers((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            statusArr: [],
            position: pos,
          },
        }));
        return;
      } else {
        prevStatusRef.current[id] = statusArr;
      }

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
      top: 16,
      left: "50%",
      transform: "translateX(-50%)",
      background: "#fffae6",
      color: "#333",
      padding: "12px 24px",
      border: "2px solid #ffd700",
      borderRadius: 6,
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      animation: "fadeNotif 5s forwards",
    },
  };

  return (
    <div style={s.wrapper}>
      {/* keyframes */}
      <style>{`
        @keyframes fadeOut {
          0% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes fadeNotif {
          0% { opacity: 1; }
          80% { opacity: 1; }
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
                  <td style={s.td}>{position?.lat.toFixed(6) || "–"}</td>
                  <td style={s.td}>{position?.lng.toFixed(6) || "–"}</td>
                  <td style={s.td}>
                    {statusArr.length > 0 ? statusArr.join(" ") : ""}
                  </td>
                  <td style={s.td}>{btn}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Route Details */}
        <div style={s.routeDetails}>
          <h3>Route Details</h3>
          {Object.values(drivers).map((d) => {
            if (!d.route || d.route.length === 0) return null;
            return (
              <div key={d.id} style={{ marginBottom: 20 }}>
                <strong>Xe {d.id}</strong>
                <table style={s.routeTable}>
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
            );
          })}
        </div>
      </div>

      {/* Console Logs */}
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
    </div>
  );
}
