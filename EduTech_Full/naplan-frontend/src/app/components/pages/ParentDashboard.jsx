import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";
import {
  fetchChildrenSummaries,
  createChild,
  deleteChild,
  checkUsername,
} from "@/app/utils/api-children";

/* =========================
   MAIN COMPONENT
========================= */
export default function ParentDashboard() {
  const navigate = useNavigate();
  const { parentToken, parentProfile, logout } = useAuth();

  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  /* ─── Fetch children on mount ─── */
  const loadChildren = useCallback(async () => {
    if (!parentToken) return;
    try {
      setLoading(true);
      const data = await fetchChildrenSummaries(parentToken);
      setChildren(data);
      setError(null);
    } catch (err) {
      console.error("Failed to load children:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [parentToken]);

  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  /* ─── Enhanced data (status derivation) ─── */
  const enhancedChildren = useMemo(() => {
    return children.map((child) => ({
      ...child,
      // Use backend status directly
      name: child.display_name || child.username || "Child",
      yearLevel: `Year ${child.year_level}`,
    }));
  }, [children]);

  const totalQuizzes = enhancedChildren.reduce((acc, c) => acc + (c.quizCount || 0), 0);

  const avgScore =
    enhancedChildren.length > 0
      ? enhancedChildren.reduce((acc, c) => acc + (c.averageScore || 0), 0) /
        enhancedChildren.length
      : 0;

  const expiredCount = enhancedChildren.filter((c) => c.status === "expired").length;

  /* ─── Add child → real API ─── */
  const handleAddChild = async (formData) => {
    try {
      setActionLoading(true);
      await createChild(parentToken, formData);
      await loadChildren(); // Refresh with stats
    } catch (err) {
      alert(err.message || "Failed to add child");
    } finally {
      setActionLoading(false);
    }
  };

  /* ─── Delete child → real API ─── */
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await deleteChild(parentToken, deleteTarget._id);
      setChildren((prev) => prev.filter((c) => c._id !== deleteTarget._id));
      setDeleteTarget(null);
    } catch (err) {
      alert(err.message || "Failed to delete child");
    } finally {
      setActionLoading(false);
    }
  };

  /* ─── Navigate to child's results ─── */
  const handleViewChild = (child) => {
    // Navigate to child dashboard or results view
    navigate(`/child-dashboard?childId=${child._id}`);
  };

  /* ─── Logout ─── */
  const handleLogout = () => {
    logout();
    navigate("/");
  };

  /* ─── Format relative time ─── */
  const formatLastActivity = (dateStr) => {
    if (!dateStr) return "No activity yet";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 30) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const parentName = parentProfile?.firstName || parentProfile?.name?.split(" ")[0] || "there";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* TOP NAVIGATION */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-10">
        <h1 className="text-lg font-semibold text-slate-900">KAI Solutions</h1>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-lg text-sm border border-slate-300 hover:bg-slate-100"
          >
            Back to Menu
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="px-6 lg:px-10 py-8 space-y-8">
        {/* PAGE HEADER */}
        <section className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Hi {parentName}</h2>
            <p className="text-sm text-slate-500 mt-1">
              Real-time visibility into your children's learning progress.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
          >
            + Add Child
          </button>
        </section>

        {/* ERROR */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">
            Failed to load data: {error}
            <button onClick={loadChildren} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {/* ALERT */}
        {expiredCount > 0 && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl">
            {expiredCount} expired account{expiredCount > 1 ? "s" : ""}. Renew to continue access.
          </div>
        )}

        {/* KPI GRID */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KPI label="Children" value={enhancedChildren.length} />
          <KPI label="Total Quizzes" value={totalQuizzes} />
          <KPI label="Average Score" value={`${avgScore.toFixed(0)}%`} highlight />
        </section>

        {/* EMPTY STATE */}
        {enhancedChildren.length === 0 && !error && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg">No children added yet.</p>
            <p className="text-slate-400 text-sm mt-2">
              Click "+ Add Child" to create your first child profile.
            </p>
          </div>
        )}

        {/* CHILD CARDS */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {enhancedChildren.map((child) => (
            <ChildCard
              key={child._id}
              child={child}
              formatLastActivity={formatLastActivity}
              onDelete={() => setDeleteTarget(child)}
              onView={() => handleViewChild(child)}
            />
          ))}
        </section>
      </main>

      {/* ADD CHILD MODAL */}
      {isAddModalOpen && (
        <AddChildModal
          onClose={() => setIsAddModalOpen(false)}
          onAdd={handleAddChild}
          loading={actionLoading}
        />
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteTarget && (
        <DeleteConfirmModal
          child={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          loading={actionLoading}
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
function ChildCard({ child, onDelete, onView, formatLastActivity }) {
  const score = child.averageScore || 0;
  const performanceColor =
    score >= 85 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : "bg-rose-500";

  const statusStyles = {
    active: "bg-emerald-100 text-emerald-700",
    trial: "bg-amber-100 text-amber-700",
    expired: "bg-rose-100 text-rose-700",
  };

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md relative cursor-pointer"
      onClick={onView}
    >
      {/* DELETE BUTTON */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-4 right-4 text-xs text-rose-600 hover:underline"
      >
        Delete
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-lg">
          {(child.name || "?").charAt(0).toUpperCase()}
        </div>
        <div>
          <h3 className="font-medium text-slate-900">{child.name}</h3>
          <p className="text-xs text-slate-500">
            {child.yearLevel} &bull; @{child.username}
          </p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="mt-4">
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            statusStyles[child.status] || statusStyles.trial
          }`}
        >
          {child.status}
        </span>
      </div>

      {/* Performance */}
      <div className="mt-6 space-y-2">
        <div className="flex justify-between text-xs text-slate-600">
          <span>Performance</span>
          <span>{score}%</span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${performanceColor} transition-all duration-500`}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-6 text-xs text-slate-600 space-y-1">
        <p>Quizzes: {child.quizCount || 0}</p>
        <p>Last Activity: {formatLastActivity(child.lastActivity)}</p>
      </div>
    </div>
  );
}

/* =========================
   ADD CHILD MODAL
========================= */
function AddChildModal({ onClose, onAdd, loading }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [usernameStatus, setUsernameStatus] = useState(null); // null | "checking" | "available" | "taken"

  // Live username uniqueness check (debounced)
  useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (!clean || clean.length < 3 || !/^[a-z0-9_]+$/.test(clean)) {
      setUsernameStatus(null);
      return;
    }

    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await checkUsername(clean);
        setUsernameStatus(res.available ? "available" : "taken");
      } catch {
        setUsernameStatus(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username.trim().toLowerCase())) {
      setError("Username must be 3–20 chars: lowercase letters, numbers, underscores");
      return;
    }
    if (usernameStatus === "taken") {
      setError("Username is already taken");
      return;
    }
    if (!yearLevel) {
      setError("Year level is required");
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN must be 4–6 digits");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }

    await onAdd({
      display_name: displayName.trim(),
      username: username.trim().toLowerCase(),
      year_level: Number(yearLevel),
      pin,
    });
    onClose();
  };

  return (
    <ModalWrapper onClose={onClose}>
      <h3 className="text-lg font-semibold">Add New Child</h3>

      {error && (
        <div className="mt-3 text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
          <input
            required
            placeholder="e.g. Vishaka"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        {/* Username */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
          <input
            required
            placeholder="e.g. vishaka_y3"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            maxLength={20}
          />
          {usernameStatus === "checking" && (
            <p className="text-xs text-slate-400 mt-1">Checking availability...</p>
          )}
          {usernameStatus === "available" && (
            <p className="text-xs text-emerald-600 mt-1">Username is available</p>
          )}
          {usernameStatus === "taken" && (
            <p className="text-xs text-rose-600 mt-1">Username is taken</p>
          )}
        </div>

        {/* Year Level */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Year Level</label>
          <select
            required
            className="w-full px-3 py-2 border rounded-lg text-sm"
            value={yearLevel}
            onChange={(e) => setYearLevel(e.target.value)}
          >
            <option value="">Select year level</option>
            <option value="3">Year 3</option>
            <option value="5">Year 5</option>
            <option value="7">Year 7</option>
            <option value="9">Year 9</option>
          </select>
        </div>

        {/* PIN */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">PIN (4–6 digits)</label>
          <input
            required
            type="password"
            inputMode="numeric"
            placeholder="Enter PIN"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
          />
        </div>

        {/* Confirm PIN */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Confirm PIN</label>
          <input
            required
            type="password"
            inputMode="numeric"
            placeholder="Re-enter PIN"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || usernameStatus === "taken"}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add Child"}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}

/* =========================
   DELETE CONFIRM MODAL
========================= */
function DeleteConfirmModal({ child, onCancel, onConfirm, loading }) {
  return (
    <ModalWrapper onClose={onCancel}>
      <h3 className="text-lg font-semibold text-slate-900">
        Delete {child.name || child.display_name}?
      </h3>
      <p className="text-sm text-slate-500 mt-2">This action cannot be undone.</p>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm hover:bg-rose-700 disabled:opacity-50"
        >
          {loading ? "Deleting..." : "Delete"}
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md rounded-xl p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}