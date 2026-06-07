/**
 * AIImageGenerator.jsx  (v2 — WITH USAGE WIDGET & BUDGET CHECK)
 *
 * ═══════════════════════════════════════════════════════════════
 * Modal for AI image generation. Shows current month's budget
 * at the top, blocks generation when exceeded, and refreshes
 * usage after each generation.
 *
 * Props:
 *   open          — boolean
 *   onClose       — () => void
 *   onUseImage    — (url) => void
 *   defaultPrompt — optional, pre-fills prompt with question text
 *
 * Place in: src/app/components/admin/AIImageGenerator.jsx
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from "react";
import AIUsageWidget from "./AIUsageWidget";

const API = import.meta.env.VITE_API_BASE_URL || "";

const STYLE_PRESETS = [
  { value: "diagram",      label: "📐 Diagram",      desc: "Clear educational diagram",  suffix: "Drawn as a clean flat educational diagram with clear labels and arrows, white background, suitable for a maths or science textbook." },
  { value: "illustration", label: "🎨 Illustration", desc: "Colourful cartoon style",    suffix: "Drawn as a colourful child-friendly cartoon illustration with simple shapes, bright primary colours, and a white or pale background." },
  { value: "photo",        label: "📷 Photo",        desc: "Realistic photograph",       suffix: "Rendered as a clean realistic photograph with natural lighting and a simple uncluttered background." },
  { value: "icon",         label: "⬜ Icon",         desc: "Simple flat icon",          suffix: "Drawn as a single simple flat icon with one or two colours, no background, suitable for a small inline graphic." },
];

const SIZE_OPTIONS = [
  { value: "1024x1024", label: "Square",    ratio: "1:1",  cost: 0.04 },
  { value: "1792x1024", label: "Landscape", ratio: "16:9", cost: 0.08 },
  { value: "1024x1792", label: "Portrait",  ratio: "9:16", cost: 0.08 },
];

export default function AIImageGenerator({
  open,
  onClose,
  onUseImage,
  defaultPrompt = "",
}) {
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState("diagram");
  const [size, setSize] = useState("1024x1024");
  const [hdQuality, setHdQuality] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [revisedPrompt, setRevisedPrompt] = useState("");
  const [history, setHistory] = useState([]);

  // Budget state — synced from AIUsageWidget via onLoad callback
  const [budgetStatus, setBudgetStatus] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /* Pre-fill prompt when opened */
  useEffect(() => {
    if (open && defaultPrompt && !prompt) {
      setPrompt(defaultPrompt.slice(0, 1000));
    }
  }, [open, defaultPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Estimated cost for this generation */
  const estimatedCost = (() => {
    const sizeCost = SIZE_OPTIONS.find((s) => s.value === size)?.cost || 0.04;
    return hdQuality ? sizeCost * 2 : sizeCost;
  })();

  const blocked = budgetStatus?.blocked || false;
  const wouldExceedBudget = budgetStatus
    ? estimatedCost > budgetStatus.remaining_usd
    : false;

  /* ─── Handlers ────────────────────────────────────────────── */

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  if (!open) return null;

  const handleGenerate = async () => {
    setError("");
    if (!prompt.trim() || prompt.trim().length < 4) {
      setError("Please describe the image (at least 4 characters).");
      return;
    }
    if (blocked) {
      setError("Monthly budget exhausted. Please wait until next month or raise the limit.");
      return;
    }
    if (wouldExceedBudget) {
      setError(`This would exceed your remaining budget ($${budgetStatus.remaining_usd.toFixed(2)} left, this costs $${estimatedCost.toFixed(2)}).`);
      return;
    }

    setLoading(true);
    setResultUrl("");
    setRevisedPrompt("");

    try {
      const token = localStorage.getItem("admin_token");
      const suffix = STYLE_PRESETS.find((p) => p.value === preset)?.suffix || "";
      const fullPrompt = `${prompt.trim()}\n\n${suffix}`;

      const res = await fetch(`${API}/api/admin/generate-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: fullPrompt,
          size,
          style: "natural",
          quality: hdQuality ? "hd" : "standard",
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Backend returned 402 — budget exhausted
      if (res.status === 402) {
        setError(
          data.error +
            (data.budget
              ? ` (spent $${data.budget.spent_usd.toFixed(2)} of $${data.budget.monthly_budget_usd})`
              : "")
        );
        setRefreshKey((k) => k + 1); // refresh widget
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Generation failed (${res.status})`);
      }

      setResultUrl(data.url);
      setRevisedPrompt(data.revised_prompt || "");
      setHistory((prev) => [
        { url: data.url, prompt: prompt.trim(), cost: data.cost_usd },
        ...prev.slice(0, 3),
      ]);

      // Trigger usage widget refresh
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e.message || "Image generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleUseImage = (url) => {
    const finalUrl = url || resultUrl;
    if (!finalUrl) return;
    onUseImage(finalUrl);
    setPrompt("");
    setResultUrl("");
    setRevisedPrompt("");
    setError("");
    onClose();
  };

  /* ─── UI ──────────────────────────────────────────────────── */

  const generateDisabled =
    loading ||
    !prompt.trim() ||
    blocked ||
    wouldExceedBudget;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-gradient-to-r from-purple-900/40 to-indigo-900/40">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✨</span>
            <div>
              <h2 className="text-white font-semibold text-base">Generate image with AI</h2>
              <p className="text-[11px] text-slate-400">Powered by OpenAI DALL-E</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-slate-400 hover:text-white disabled:opacity-50 text-xl w-8 h-8 rounded-lg hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {/* ✨ NEW — Budget widget at the top */}
          <AIUsageWidget
            compact
            refreshKey={refreshKey}
            onLoad={setBudgetStatus}
          />

          {/* Prompt */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Describe the image you want
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='e.g. "A wooden ruler marked from 0 to 100 centimetres with an arrow above labelled 1 metre"'
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 resize-none disabled:opacity-50"
              maxLength={1000}
              disabled={loading || blocked}
            />
            <div className="flex justify-between items-center mt-1">
              <span className="text-[10px] text-slate-500">
                Tip: be specific. Mention shapes, numbers, colours, and what should be labelled.
              </span>
              <span className="text-[10px] text-slate-500">{prompt.length}/1000</span>
            </div>
          </div>

          {/* Style */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Style</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STYLE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPreset(p.value)}
                  disabled={loading || blocked}
                  className={`px-3 py-2 rounded-lg text-xs border text-left transition disabled:opacity-50 ${
                    preset === p.value
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <div className="font-medium">{p.label}</div>
                  <div className="text-[10px] opacity-75 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Size + quality */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Aspect ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {SIZE_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setSize(s.value)}
                    disabled={loading || blocked}
                    className={`px-2 py-2 rounded-lg text-[11px] border disabled:opacity-50 ${
                      size === s.value
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <div>{s.label}</div>
                    <div className="text-[9px] opacity-75">{s.ratio}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Quality</label>
              <div className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={hdQuality}
                    onChange={(e) => setHdQuality(e.target.checked)}
                    disabled={loading || blocked}
                    className="w-4 h-4"
                  />
                  HD quality (2× cost)
                </label>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                This image will cost ~${estimatedCost.toFixed(3)}
              </p>
            </div>
          </div>

          {/* Insufficient budget warning */}
          {wouldExceedBudget && !blocked && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg px-3 py-2 text-sm text-amber-200">
              ⚠️ This image costs ${estimatedCost.toFixed(2)} but only ${budgetStatus?.remaining_usd?.toFixed(2)} is left this month.
              Try a standard quality or smaller size.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2 text-sm text-red-300 flex items-start gap-2">
              <span>⚠️</span><span>{error}</span>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="bg-indigo-900/20 border border-indigo-700/40 rounded-lg p-4 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="text-sm text-indigo-200 font-medium">Generating...</p>
                <p className="text-[11px] text-indigo-300/70">Usually takes 10-20 seconds</p>
              </div>
            </div>
          )}

          {/* Result */}
          {resultUrl && !loading && (
            <div className="space-y-2 border-t border-slate-700 pt-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-slate-300">Generated image:</div>
                <div className="text-[10px] text-slate-500">
                  Cost: ${history[0]?.cost?.toFixed(3) || estimatedCost.toFixed(3)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2">
                <img
                  src={resultUrl}
                  alt="Generated"
                  className="w-full rounded-lg border border-slate-700 max-h-[400px] object-contain bg-white"
                />
              </div>
              {revisedPrompt && (
                <details className="text-[11px] text-slate-500">
                  <summary className="cursor-pointer hover:text-slate-300">
                    What the AI actually drew (click)
                  </summary>
                  <p className="mt-1 italic px-2 py-1 bg-slate-800/50 rounded">{revisedPrompt}</p>
                </details>
              )}
            </div>
          )}

          {/* History */}
          {history.length > 1 && !loading && (
            <div className="border-t border-slate-700 pt-4">
              <div className="text-xs font-medium text-slate-300 mb-2">
                Previous generations (this session)
              </div>
              <div className="grid grid-cols-4 gap-2">
                {history.slice(1).map((h, i) => (
                  <button
                    key={i}
                    onClick={() => handleUseImage(h.url)}
                    className="bg-slate-800 border border-slate-700 hover:border-indigo-500 rounded-lg p-1 transition group relative"
                    title={h.prompt}
                  >
                    <img src={h.url} alt="Previous" className="w-full aspect-square object-cover rounded" />
                    <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[8px] px-1 rounded">
                      ${h.cost?.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Click any thumbnail to use it</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 px-5 py-3 bg-slate-900/80 flex justify-end gap-2">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generateDisabled}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg flex items-center gap-1.5"
            title={
              blocked ? "Monthly budget exhausted" :
              wouldExceedBudget ? "Not enough budget remaining" : ""
            }
          >
            {loading ? "Generating..." : resultUrl ? "🔄 Regenerate" : `✨ Generate (~$${estimatedCost.toFixed(2)})`}
          </button>
          {resultUrl && !loading && (
            <button
              onClick={() => handleUseImage()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5"
            >
              ✓ Use this image
            </button>
          )}
        </div>
      </div>
    </div>
  );
}