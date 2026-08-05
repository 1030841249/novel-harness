export function formatNumber(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)} 万`;
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function projectInitial(name: string): string {
  return name.replace(/[：:《》\-\s]/g, "").slice(0, 2) || "书";
}
