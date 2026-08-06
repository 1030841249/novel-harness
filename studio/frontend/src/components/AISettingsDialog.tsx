import { KeyRound, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { AIConfig, AIConfigInput, ChatStatus } from "../types";

const EMPTY_CONFIG: AIConfig = {
  preset: "custom",
  base_url: "",
  model: "",
  api_key_set: false,
  timeout_seconds: 120,
  source: "none",
  presets: [],
};

export function AISettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved?: (status: ChatStatus) => void }) {
  const [config, setConfig] = useState<AIConfig>(EMPTY_CONFIG);
  const [input, setInput] = useState<AIConfigInput>({ preset: "custom", base_url: "", model: "", timeout_seconds: 120 });
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedPreset = useMemo(() => config.presets.find((item) => item.id === input.preset), [config.presets, input.preset]);
  const savedKeyApplies = config.api_key_set && config.base_url.replace(/\/$/, "") === input.base_url.trim().replace(/\/$/, "");

  useEffect(() => {
    api.aiConfig().then((next) => {
      setConfig(next);
      setInput({ preset: next.preset, base_url: next.base_url, model: next.model, timeout_seconds: next.timeout_seconds });
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, []);

  function selectPreset(presetId: string) {
    const preset = config.presets.find((item) => item.id === presetId);
    setInput((current) => ({ ...current, preset: presetId, base_url: preset?.base_url || "", model: "" }));
    setModels([]);
    setError("");
  }

  async function discoverModels() {
    if (!input.base_url.trim()) return setError("请先填写模型接口地址");
    setDiscovering(true);
    setError("");
    try {
      const result = await api.discoverAIModels(input.base_url.trim(), apiKey.trim(), input.timeout_seconds);
      setModels(result.models);
      if (!input.model && result.models[0]) setInput((current) => ({ ...current, model: result.models[0] }));
    } catch (reason) {
      setModels([]);
      setError(reason instanceof Error ? reason.message : "读取模型列表失败");
    } finally {
      setDiscovering(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.base_url.trim()) return setError("请输入模型接口地址");
    if (!input.model.trim()) return setError("请选择或填写模型 ID");
    setSaving(true);
    setError("");
    try {
      const status = await api.saveAIConfig({
        ...input,
        base_url: input.base_url.trim(),
        model: input.model.trim(),
        api_key: apiKey.trim() || undefined,
      });
      onSaved?.(status);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存模型设置失败");
    } finally {
      setSaving(false);
    }
  }

  async function clearConfig() {
    if (!window.confirm("清除 Studio 本地保存的 AI 模型设置？")) return;
    setSaving(true);
    setError("");
    try {
      const status = await api.clearAIConfig();
      onSaved?.(status);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "清除模型设置失败");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="dialog ai-settings-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-dialog-heading">
          <span><Settings2 size={20} /></span>
          <div><h2>AI 模型设置</h2><p>连接 OpenAI 兼容服务，保存后立即用于创作陪练</p></div>
        </div>
        {loading ? <div className="settings-loading">正在读取本地配置</div> : <div className="settings-form">
          <label>模型服务
            <select value={input.preset} onChange={(event) => selectPreset(event.target.value)}>
              {config.presets.map((preset) => <option value={preset.id} key={preset.id}>{preset.label}</option>)}
            </select>
          </label>
          <label>请求超时
            <select value={input.timeout_seconds} onChange={(event) => setInput({ ...input, timeout_seconds: Number(event.target.value) })}>
              {[30, 60, 120, 300, 600].map((seconds) => <option value={seconds} key={seconds}>{seconds} 秒</option>)}
            </select>
          </label>
          <label className="form-span">接口地址
            <input value={input.base_url} onChange={(event) => { setInput({ ...input, base_url: event.target.value }); setModels([]); }} placeholder="https://api.example.com/v1" />
          </label>
          <label className="form-span">API Key
            <span className="secret-input"><KeyRound size={16} /><input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={savedKeyApplies ? "已保存，留空则保持不变" : selectedPreset?.requires_api_key ? "请输入模型服务密钥" : "本地服务通常可以留空"} /></span>
          </label>
          <label className="form-span">模型 ID
            <span className="model-input-row"><input list="available-ai-models" value={input.model} onChange={(event) => setInput({ ...input, model: event.target.value })} placeholder="先读取模型，或直接填写模型 ID" /><button className="button" type="button" onClick={() => void discoverModels()} disabled={discovering}><RefreshCw className={discovering ? "spin" : ""} size={15} /> {discovering ? "读取中" : "读取模型"}</button></span>
            <datalist id="available-ai-models">{models.map((model) => <option value={model} key={model} />)}</datalist>
            {models.length > 0 && <small className="field-note">已读取 {models.length} 个模型，可从输入框候选中选择</small>}
          </label>
        </div>}
        {config.source !== "none" && !loading && <div className="settings-source"><span className="ready-dot" /> 当前来源：{config.source === "local" ? "Studio 本地设置" : "启动环境变量"}{config.model ? ` · ${config.model}` : ""}</div>}
        {error && <span className="form-error">{error}</span>}
        <div className="dialog-actions dialog-actions-split">
          {config.source === "local" ? <button className="button settings-clear" type="button" onClick={() => void clearConfig()} disabled={saving}><Trash2 size={15} /> 清除本地设置</button> : <span />}
          <button className="button" type="button" onClick={onClose}>取消</button>
          <button className="button button-primary" disabled={loading || saving}>{saving ? "正在保存" : "保存并启用"}</button>
        </div>
      </form>
    </div>
  );
}
