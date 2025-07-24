// api.js
export async function getDrivers() {
  const res = await fetch("/drivers"); // <-- dùng path tương đối
  if (!res.ok) throw new Error("Không thể lấy danh sách");
  return res.json();
}
