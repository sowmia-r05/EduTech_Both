import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/app/components/ui/select";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";

import { updateChild } from "@/app/utils/childrenApi";

export default function EditChildDialog({ open, onOpenChange, child, onChildUpdated }) {
  const [form, setForm] = useState({
    display_name: "",
    year_level: "",
    pin: "",
    confirmPin: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Pre-fill form when child changes
  useEffect(() => {
    if (child && open) {
      setForm({
        display_name: child.display_name || "",
        year_level: String(child.year_level || ""),
        pin: "",
        confirmPin: "",
      });
      setError("");
    }
  }, [child, open]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  };

  const pinEntered = form.pin.length > 0;
  const pinValid = !pinEntered || /^\d{4,6}$/.test(form.pin);
  const pinsMatch = !pinEntered || (form.pin === form.confirmPin);

  const canSubmit = form.display_name.trim() && form.year_level && pinValid && pinsMatch && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || !child) return;
    setError("");
    setLoading(true);

    try {
      const updates = {
        display_name: form.display_name.trim(),
        year_level: Number(form.year_level),
      };
      if (pinEntered) {
        updates.pin = form.pin;
      }

      const updated = await updateChild(child._id, updates);
      onChildUpdated?.(updated);
      onOpenChange(false);
    } catch (err) {
      setError(err.message || "Failed to update child profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Child Profile</DialogTitle>
          <DialogDescription>Update {child?.display_name}'s profile. Leave PIN blank to keep it unchanged.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="edit_display_name">Display Name</Label>
            <Input
              id="edit_display_name"
              value={form.display_name}
              onChange={(e) => updateField("display_name", e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Username (read-only) */}
          <div className="space-y-2">
            <Label>Username</Label>
            <Input value={child?.username || ""} disabled className="bg-gray-50 text-gray-500" />
            <p className="text-xs text-gray-400">Usernames cannot be changed</p>
          </div>

          {/* Year Level */}
          <div className="space-y-2">
            <Label>Year Level</Label>
            <Select
              value={form.year_level}
              onValueChange={(v) => updateField("year_level", v)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Year 3</SelectItem>
                <SelectItem value="5">Year 5</SelectItem>
                <SelectItem value="7">Year 7</SelectItem>
                <SelectItem value="9">Year 9</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* PIN (optional change) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit_pin">New PIN (optional)</Label>
              <Input
                id="edit_pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={form.pin}
                onChange={(e) => updateField("pin", e.target.value.replace(/\D/g, ""))}
                placeholder="Leave blank"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_confirmPin">Confirm PIN</Label>
              <Input
                id="edit_confirmPin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={form.confirmPin}
                onChange={(e) => updateField("confirmPin", e.target.value.replace(/\D/g, ""))}
                placeholder="Leave blank"
                disabled={loading}
              />
            </div>
          </div>
          {pinEntered && !pinValid && (
            <p className="text-xs text-red-500 -mt-2">PIN must be 4–6 digits</p>
          )}
          {pinEntered && form.confirmPin.length > 0 && !pinsMatch && (
            <p className="text-xs text-red-500 -mt-2">PINs do not match</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={!canSubmit}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
