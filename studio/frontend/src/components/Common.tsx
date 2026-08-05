import { AlertCircle, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label = "正在读取本地项目" }: { label?: string }) {
  return (
    <div className="center-state">
      <LoaderCircle className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="center-state error-state">
      <AlertCircle size={22} />
      <strong>加载失败</strong>
      <span>{message}</span>
      {action}
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge status-${value}`}>{value}</span>;
}
