import React, { useMemo, useState } from "react";

/* =========================
   MOCK DATA
========================= */
const initialChildren = [
  {
    id: 1,
    name: "Vishaka Radha",
    username: "vishaka_r3",
    yearLevel: "Year 3",
    subscriptionType: "yearly",
    subscriptionEndsAt: "2026-12-31",
    quizCount: 48,
    lastActivity: "1 day ago",
    averageScore: 86,
  },
  {
    id: 2,
    name: "Arjun Patel",
    username: "arjun_math2",
    yearLevel: "Year 2",
    subscriptionType: "trial",
    subscriptionEndsAt: "2026-03-10",
    quizCount: 12,
    lastActivity: "3 days ago",
    averageScore: 74,
  },
  {
    id: 3,
    name: "Meera Iyer",
    username: "meera_read4",
    yearLevel: "Year 4",
    subscriptionType: "monthly",
    subscriptionEndsAt: "2026-01-01",
    quizCount: 31,
    lastActivity: "12 days ago",
    averageScore: 61,
  },
];

/* =========================
   MAIN COMPONENT
========================= */
export default function ParentDashboard() {
  const [children, setChildren] = useState(initialChildren);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  /* =========================
     ENHANCED DATA
  ========================= */
  const enhancedChildren = useMemo(() => {
    return children.map((child) => {
      const now = new Date();
      const end = new Date(child.subscriptionEndsAt);
      const expired = end < now;

      const status = expired
        ? "expired"
        : child.subscriptionType === "trial"
        ? "trial"
        : "active";

      const daysRemaining = Math.max(
        0,
        Math.ceil((end - now) / (1000 * 60 * 60 * 24))
      );

      return { ...child, status, daysRemaining };
    });
  }, [children]);

  const totalQuizzes = enhancedChildren.reduce(
    (acc, c) => acc + c.quizCount,
    0
  );

  const avgScore =
    enhancedChildren.length > 0
      ? enhancedChildren.reduce((acc, c) => acc + c.averageScore, 0) /
        enhancedChildren.length
      : 0;

  const expiredCount = enhancedChildren.filter(
    (c) => c.status === "expired"
  ).length;

  /* =========================
     ADD CHILD
  ========================= */
  const handleAddChild = (newChild) => {
    setChildren((prev) => [...prev, newChild]);
  };

  /* =========================
     DELETE CHILD
  ========================= */
  const confirmDelete = () => {
    setChildren((prev) =>
      prev.filter((child) => child.id !== deleteTarget.id)
    );
    setDeleteTarget(null);
  };

  return (
    <div className="min-h-screen bg-slate-50">

      {/* TOP NAVIGATION */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-10">
        <h1 className="text-lg font-semibold text-slate-900">
          KAI Solutions
        </h1>

        <div className="flex gap-3">
          <button className="px-4 py-2 rounded-lg text-sm border border-slate-300 hover:bg-slate-100">
            Back to Menu
          </button>
          <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700">
            Logout
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="px-6 lg:px-10 py-8 space-y-8">

        {/* PAGE HEADER */}
        <section className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              Hi Parent Name
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Real-time visibility into your children’s learning progress.
            </p>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
          >
            + Add Child
          </button>
        </section>

        {/* ALERT */}
        {expiredCount > 0 && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">
            {expiredCount} expired account
            {expiredCount > 1 ? "s" : ""}. Renew to continue access.
          </div>
        )}

        {/* KPI GRID */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KPI label="Children" value={enhancedChildren.length} />
          <KPI label="Total Quizzes" value={totalQuizzes} />
          <KPI
            label="Average Score"
            value={`${avgScore.toFixed(0)}%`}
            highlight
          />
        </section>

        {/* CHILD CARDS */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {enhancedChildren.map((child) => (
            <ChildCard
              key={child.id}
              child={child}
              onDelete={() => setDeleteTarget(child)}
            />
          ))}
        </section>

      </main>

      {/* ADD CHILD MODAL */}
      {isAddModalOpen && (
        <AddChildModal
          onClose={() => setIsAddModalOpen(false)}
          onAdd={handleAddChild}
        />
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteTarget && (
        <DeleteConfirmModal
          child={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

/* =========================
   KPI COMPONENT
========================= */
function KPI({ label, value, highlight }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          highlight ? "text-indigo-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/* =========================
   CHILD CARD
========================= */
function ChildCard({ child, onDelete }) {
  const performanceColor =
    child.averageScore >= 85
      ? "bg-emerald-500"
      : child.averageScore >= 70
      ? "bg-amber-500"
      : "bg-rose-500";

  const statusStyles = {
    active: "bg-emerald-100 text-emerald-700",
    trial: "bg-amber-100 text-amber-700",
    expired: "bg-rose-100 text-rose-700",
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md relative">

      {/* DELETE BUTTON */}
      <button
        onClick={onDelete}
        className="absolute top-4 right-4 text-xs text-rose-600 hover:underline"
      >
        Delete
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold">
          {child.name.charAt(0)}
        </div>
        <div>
          <h3 className="font-medium text-slate-900">{child.name}</h3>
          <p className="text-xs text-slate-500">
            {child.yearLevel} • @{child.username}
          </p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="mt-4">
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyles[child.status]}`}
        >
          {child.status}
        </span>
      </div>

      {/* Performance */}
      <div className="mt-6 space-y-2">
        <div className="flex justify-between text-xs text-slate-600">
          <span>Performance</span>
          <span>{child.averageScore}%</span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${performanceColor}`}
            style={{ width: `${child.averageScore}%` }}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-6 text-xs text-slate-600 space-y-1">
        <p>Quizzes: {child.quizCount}</p>
        <p>Last Activity: {child.lastActivity}</p>
      </div>
    </div>
  );
}

/* =========================
   ADD CHILD MODAL
========================= */
function AddChildModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [yearLevel, setYearLevel] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({
      id: Date.now(),
      name,
      username: name.toLowerCase().replace(/\s/g, "_"),
      yearLevel,
      subscriptionType: "trial",
      subscriptionEndsAt: "2026-12-31",
      quizCount: 0,
      lastActivity: "Just now",
      averageScore: 0,
    });
    onClose();
  };

  return (
    <ModalWrapper onClose={onClose}>
      <h3 className="text-lg font-semibold">Add New Child</h3>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          required
          placeholder="Child Name"
          className="w-full px-3 py-2 border rounded-lg"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          required
          placeholder="Year Level"
          className="w-full px-3 py-2 border rounded-lg"
          value={yearLevel}
          onChange={(e) => setYearLevel(e.target.value)}
        />
        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg">
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg">
            Add
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}

/* =========================
   DELETE CONFIRM MODAL
========================= */
function DeleteConfirmModal({ child, onCancel, onConfirm }) {
  return (
    <ModalWrapper onClose={onCancel}>
      <h3 className="text-lg font-semibold text-slate-900">
        Delete {child.name}?
      </h3>
      <p className="text-sm text-slate-500 mt-2">
        This action cannot be undone.
      </p>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 bg-rose-600 text-white rounded-lg"
        >
          Delete
        </button>
      </div>
    </ModalWrapper>
  );
}

/* =========================
   MODAL WRAPPER
========================= */
function ModalWrapper({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}