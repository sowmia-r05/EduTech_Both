/**
 * components/admin/DownloadImageButton.jsx
 *
 * Downloads the image attached to a question.
 * Works with:
 *   - S3 public URLs  (https://...)
 *   - base64 data URIs (data:image/jpeg;base64,...)
 *
 * Props:
 *   imageUrl   {string}  — question.image_url or extracted from question_text
 *   filename   {string}  — optional, defaults to "question_image"
 *
 * Usage inside QuizDetailPage / QuizDetailModal question card:
 *   {q.image_url && (
 *     <DownloadImageButton imageUrl={q.image_url} filename={`q${idx+1}_image`} />
 *   )}
 */

export default function DownloadImageButton({ imageUrl, filename = "question_image" }) {
  if (!imageUrl) return null;

  const handleDownload = async () => {
    try {
      if (imageUrl.startsWith("data:")) {
        // base64 data URI — convert to blob
        const [header, b64] = imageUrl.split(",");
        const mimeMatch = header.match(/data:([^;]+)/);
        const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
        const ext  = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";

        const byteStr = atob(b64);
        const arr = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
        const blob = new Blob([arr], { type: mime });

        const url = URL.createObjectURL(blob);
        const a   = document.createElement("a");
        a.href    = url;
        a.download = `${filename}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        // Remote URL — fetch as blob to force download (avoids new tab opening)
        const res  = await fetch(imageUrl);
        const blob = await res.blob();

        // Guess extension from content-type
        const ct  = blob.type || "image/jpeg";
        const ext = ct.split("/")[1]?.replace("jpeg", "jpg") || "jpg";

        const url = URL.createObjectURL(blob);
        const a   = document.createElement("a");
        a.href    = url;
        a.download = `${filename}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      // Fallback: open in new tab if fetch fails (e.g. CORS on external URLs)
      window.open(imageUrl, "_blank", "noopener");
    }
  };

  return (
    <button
      onClick={handleDownload}
      title="Download image"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 transition-colors"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Image
    </button>
  );
}