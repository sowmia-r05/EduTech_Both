import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import {
  Plus, LogOut, User, GraduationCap, Pencil, Trash2,
  AlertCircle, Loader2, Mail, ShieldCheck, Clock,
} from "lucide-react";

import AddChildDialog from "@/app/components/dashboard/AddChildDialog";
import EditChildDialog from "@/app/components/dashboard/EditChildDialog";
import { fetchChildren, deleteChild } from "@/app/utils/childrenApi";

// ─── Status badge ───
function StatusBadge({ status }) {
  const styles = {
    trial: "bg-amber-100 text-amber-700",
    active: "bg-green-100 text-green-700",
    expired: "bg-gray-100 text-gray-500",
  };

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || styles.trial}`}>
      {status === "trial" ? "Free Trial" : status === "active" ? "Active" : "Expired"}
    </span>
  );
}

// ─── Year level badge ───
function YearBadge({ year }) {
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
      Year {year}
    </span>
  );
}

// ─── Child Card ───
function ChildCard({ child, onEdit, onDelete, onPurchase }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Remove ${child.display_name}'s profile? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(child._id);
    } finally {
      setDeleting(false);
    }
  };

  const avatarColors = [
    "bg-indigo-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
    "bg-cyan-500", "bg-purple-500", "bg-pink-500", "bg-teal-500",
  ];
  const colorIndex = (child.display_name || "").charCodeAt(0) % avatarColors.length;
  const initial = (child.display_name || "?")[0].toUpperCase();

  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          {/* Avatar + Info */}
          <div className="flex items-start gap-3">
            <div className={`w-12 h-12 rounded-full ${avatarColors[colorIndex]} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
              {initial}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{child.display_name}</h3>
              <p className="text-sm text-gray-500">@{child.username}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <YearBadge year={child.year_level} />
                <StatusBadge status={child.status} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-indigo-600"
              onClick={() => onEdit(child)}
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-red-600"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Action buttons based on status */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          {child.status === "trial" && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 text-xs">
                Try Sample Test
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700"
                onClick={() => onPurchase(child)}
              >
                Purchase Bundle
              </Button>
            </div>
          )}
          {child.status === "active" && (
            <Button size="sm" className="w-full text-xs bg-indigo-600 hover:bg-indigo-700">
              View Results
            </Button>
          )}
          {child.status === "expired" && (
            <Button
              size="sm"
              className="w-full text-xs bg-indigo-600 hover:bg-indigo-700"
              onClick={() => onPurchase(child)}
            >
              Renew Bundle
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Email verification banner ───
function VerifyEmailBanner({ email }) {
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
      await fetch(`${API_BASE}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {}
    setResending(false);
  };

  return (
    <Alert className="border-amber-200 bg-amber-50">
      <Mail className="h-4 w-4 text-amber-600" />
      <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-amber-800">
          Please verify your email address. Check your inbox for a verification link.
        </span>
        {!sent ? (
          <Button size="sm" variant="outline" onClick={handleResend} disabled={resending} className="text-xs">
            {resending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Resend
          </Button>
        ) : (
          <span className="text-xs text-green-600 font-medium">Sent!</span>
        )}
      </AlertDescription>
    </Alert>
  );
}

// ─── Main Dashboard ───
export default function ParentDashboard() {
  const navigate = useNavigate();
  const { parent, logout, loading: authLoading } = useAuth();

  const [children, setChildren] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [error, setError] = useState("");

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editChild, setEditChild] = useState(null);

  const loadChildren = useCallback(async () => {
    setLoadingChildren(true);
    setError("");
    try {
      const data = await fetchChildren();
      setChildren(data);
    } catch (err) {
      setError(err.message || "Failed to load children");
    }
    setLoadingChildren(false);
  }, []);

  useEffect(() => {
    if (!authLoading) loadChildren();
  }, [authLoading, loadChildren]);

  const handleChildCreated = (newChild) => {
    setChildren((prev) => [...prev, newChild]);
  };

  const handleChildUpdated = (updatedChild) => {
    setChildren((prev) =>
      prev.map((c) => (c._id === updatedChild._id ? updatedChild : c))
    );
  };

  const handleDeleteChild = async (childId) => {
    try {
      await deleteChild(childId);
      setChildren((prev) => prev.filter((c) => c._id !== childId));
    } catch (err) {
      setError(err.message || "Failed to delete child");
    }
  };

  // ─── Phase 3: Navigate to bundle selection ───
  const handlePurchase = (child) => {
    navigate(`/bundles?childId=${child._id}&year=${child.year_level}`);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900">KAI Solutions</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
              <User className="h-4 w-4" />
              <span>{parent?.first_name} {parent?.last_name}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-500 hover:text-red-600">
              <LogOut className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Email verification banner */}
        {parent && !parent.email_verified && (
          <div className="mb-6">
            <VerifyEmailBanner email={parent.email} />
          </div>
        )}

        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome, {parent?.first_name || "Parent"}
          </h1>
          <p className="text-gray-500 mt-1">
            Manage your children's NAPLAN preparation and track their progress.
          </p>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Children Section */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Children
            {children.length > 0 && (
              <span className="text-gray-400 font-normal ml-2 text-sm">({children.length})</span>
            )}
          </h2>
          <Button
            onClick={() => setAddDialogOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Child
          </Button>
        </div>

        {loadingChildren ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        ) : children.length === 0 ? (
          /* Empty state */
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                <User className="h-8 w-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No children added yet</h3>
              <p className="text-sm text-gray-500 mb-4 max-w-sm">
                Add your first child to get started with NAPLAN practice tests and AI-powered feedback.
              </p>
              <Button
                onClick={() => setAddDialogOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Your First Child
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Children grid */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map((child) => (
              <ChildCard
                key={child._id}
                child={child}
                onEdit={setEditChild}
                onDelete={handleDeleteChild}
                onPurchase={handlePurchase}
              />
            ))}
          </div>
        )}
      </main>

      {/* Dialogs */}
      <AddChildDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onChildCreated={handleChildCreated}
      />

      <EditChildDialog
        open={!!editChild}
        onOpenChange={(open) => { if (!open) setEditChild(null); }}
        child={editChild}
        onChildUpdated={handleChildUpdated}
      />
    </div>
  );
}
