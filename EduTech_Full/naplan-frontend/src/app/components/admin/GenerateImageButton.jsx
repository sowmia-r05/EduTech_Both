/**
 * components/admin/GenerateImageButton.jsx
 *
 * Drop-in companion to <FileUploadButton/> that generates an image with Qwen
 * (Alibaba DashScope) instead of uploading one. The generated image is
 * persisted to YOUR S3 bucket on the server, and the resulting public URL is
 * passed back via the SAME `onUploaded(url, data)` callback that
 * FileUploadButton uses — so it slots into existing question editors with
 * zero changes to the parent.
 *
 *   <GenerateImageButton
 *      defaultPrompt={q.question_text}
 *      onUploaded={(url, data) => setQuestion({ ...q, image_url: url })}
 *   />
 *
 * Place in: src/app/components/admin/GenerateImageButton.jsx
 *
 * Requires: POST /api/admin/generate-image  (see backend routes/aiImageRoute.js)
 */

import { useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "";

const SIZE_OPTIONS = [
  { label: "Square (1024×1024)",   value: "1024*1024" },
  { label: "Landscape (1280×720)", value: "1280*720" },
  { label: "Portrait (720×1280)",  value: "720*1280" },
  { label: "4:3 (1024×768)",       value: "1024*768" },
  { label: "3:4 (768×1024)",       value: "768*1024" },
];

const MODEL_OPTIONS = [
  { label: "Wanx 2.1 Turbo (fast, cheaper)", value: "wanx2.1-t2i-turbo" },
  { label: "Wanx 2.1 Plus (higher quality)", value: "wanx2.1-t2i-plus" },
  { label: "Qwen-Image",                     value: "qwen-image" },
];

const DEFAULT_NEGATIVE =
  "text, words, letters, watermark, logo, signature, blurry, low quality, distorted, extra limbs";

const DEFAULT_STYLE =
  "kid-friendly flat illustration, clean lines, bright colors, classroom-appropriate, no text in image";

// Strip HTML tags from question_text so the prompt isn't full of <p>/<img>/etc.
function stripHtml(html = "") {
  return String(html)
    .replace(/<img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export default function GenerateImageButton({
  defaultPrompt = "",
  onUploaded,
  buttonLabel = "✨ Generate with AI",
  buttonClassName = "",
}) {
  const [open, setOpen]         = useState(false);
  const [prompt, setPrompt]     = useState(stripHtml(defaultPrompt));
  const [size, setSize]         = useState("1024*1024");
  const [model, setModel]       = useState("wanx2.1-t2i-turbo");
  const [style, setStyle]       = useState(DEFAULT_STYLE);
  const [negative, setNegative] = useState(DEFAULT_NEGATIVE);

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [previewUrl, setPreview] = useState("");

  const openModal = () => {
    setPrompt(stripHtml(defaultPrompt));
    setError("");
    setPreview("");
    setOpen(true);
  };

  const closeModal = () => {
    if (loading) return; // don't close mid-generation
    setOpen(false);
    setError("");
    setPreview("");
  };

  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Please enter a prompt describing the image you want.");
      return;
    }

    setLoading(true);
    setError("");
    setPreview("");

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API}/api/admin/generate-image`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt:   trimmed,
          size,
          model,
          style,
          negative,
          n: 1,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Generation failed (${res.status})`);
      }

      const fullUrl = data.url?.startsWith("http") ? data.url : `${API}${data.url}`;
      setPreview(fullUrl);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const useImage = () => {
    if (!previewUrl) return;
    onUploaded?.(previewUrl, { source: "qwen", model, prompt: prompt.trim() });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={
          buttonClassName ||
          "inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium " +
          "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 " +
          "text-white border border-purple-500 transition-colors"
        }
        title="Generate image with Qwen AI"
      >
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
              <h3 className="text-base font-semibold text-white">
                ✨ Generate question image with Qwen
              </h3>
              <button
                onClick={closeModal}
                disabled={loading}
                className="text-slate-400 hover:text-white text-xl leading-none disabled:opacity-50"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Prompt */}
              <label className="block">
                <span className="text-xs font-medium text-slate-300">
                  Prompt — describe what the image should show
                </span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md bg-slate-800 border border-slate-600 text-slate-100 text-sm p-2 focus:outline-none focus:border-purple-500"
                  placeholder="e.g. Two red apples and three oranges sitting on a wooden table"
                />
                <span className="text-[10px] text-slate-500">
                  Tip: keep it concrete. {prompt.trim().length}/800 chars.
                </span>
              </label>

              {/* Style + Negative */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-300">
                    Style suffix (appended to prompt)
                  </span>
                  <input
                    type="text"
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    className="mt-1 w-full rounded-md bg-slate-800 border border-slate-600 text-slate-100 text-sm p-2 focus:outline-none focus:border-purple-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-300">
                    Negative prompt (avoid)
                  </span>
                  <input
                    type="text"
                    value={negative}
                    onChange={(e) => setNegative(e.target.value)}
                    className="mt-1 w-full rounded-md bg-slate-800 border border-slate-600 text-slate-100 text-sm p-2 focus:outline-none focus:border-purple-500"
                  />
                </label>
              </div>

              {/* Model + Size */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-300">Model</span>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="mt-1 w-full rounded-md bg-slate-800 border border-slate-600 text-slate-100 text-sm p-2 focus:outline-none focus:border-purple-500"
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-300">Size</span>
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    className="mt-1 w-full rounded-md bg-slate-800 border border-slate-600 text-slate-100 text-sm p-2 focus:outline-none focus:border-purple-500"
                  >
                    {SIZE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Error */}
              {error && (
                <div className="text-xs bg-red-900/40 border border-red-700 text-red-200 rounded-md p-2">
                  {error}
                </div>
              )}

              {/* Preview */}
              {(loading || previewUrl) && (
                <div className="rounded-md border border-slate-700 bg-slate-950 p-3">
                  <div className="text-xs text-slate-400 mb-2">Preview</div>
                  {loading && (
                    <div className="flex items-center gap-2 text-sm text-slate-300 py-8 justify-center">
                      <span className="inline-block w-4 h-4 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                      Generating with {model}… this usually takes 10–40s.
                    </div>
                  )}
                  {!loading && previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Generated preview"
                      className="max-h-80 mx-auto rounded-md border border-slate-700"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-700 bg-slate-900/60">
              <button
                onClick={closeModal}
                disabled={loading}
                className="px-3 py-1.5 rounded-md text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              {!previewUrl ? (
                <button
                  onClick={generate}
                  disabled={loading || !prompt.trim()}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white disabled:opacity-50"
                >
                  {loading ? "Generating…" : "Generate"}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { setPreview(""); generate(); }}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-md text-sm bg-slate-700 hover:bg-slate-600 text-slate-200"
                  >
                    Regenerate
                  </button>
                  <button
                    onClick={useImage}
                    className="px-3 py-1.5 rounded-md text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    Use this image
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}