// StatCard.jsx
const StatCard = ({ title, value, status = "" }) => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedValue = String(value ?? "").trim().toLowerCase();

  // ✅ all keys lowercase (because we lowercased the input)
  const statusColor = {
    unsuccessful: "text-red-600",
    fail: "text-red-600",
    failed: "text-red-600",
    f: "text-red-600",
    not_yet_achieved: "text-red-600",
    "needs attention": "text-red-600",

    med: "text-amber-600",
    medium: "text-amber-600",

    pass: "text-green-600",
    successful: "text-green-600",
  };

  const valueClass = `text-2xl font-bold tracking-tight text-center leading-tight ${
    statusColor[normalizedStatus] || "text-indigo-700"
  }`;

  return (
    <div
      className="h-24 w-full bg-white rounded-xl shadow-sm
                 flex flex-col items-center justify-center gap-1
                 border border-slate-200 px-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 text-center">
        {title}
      </p>

      {/* ✅ Center + wrap control for Practice Needed */}
      <p className={valueClass} style={{ maxWidth: "10ch" }}>
        {normalizedValue === "practice needed" ? (
          <>
            Practice <br />
            Needed
          </>
        ) : (
          value
        )}
      </p>
    </div>
  );
};

export default StatCard;
